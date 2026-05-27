# Requirements: pip install soccerdata pandas
# Usage:        python scripts/pull-fbref-stats.py
# Output:       scripts/bsa-2026-stats.csv

"""
Pulls Brasileirão Série A 2026 player match stats from FBref via the
soccerdata library and writes a CSV ready for bulk import into the
BGO Fantasy Platform.

Output columns (one row per player per match):
    matchDate, homeTeam, awayTeam, homeScore, awayScore,
    playerName, team, position, minutesPlayed, started,
    goals, assists, yellowCards, redCards,
    saves, cleanSheet, goalsConceded, penaltySaves
"""

import sys
import os
import traceback

import pandas as pd

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def flatten_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Flatten MultiIndex columns to a single level using 'Group_Stat' format.
    If columns are already flat strings, returns df unchanged.
    """
    if not isinstance(df.columns, pd.MultiIndex):
        return df

    new_cols = []
    for col in df.columns:
        if isinstance(col, tuple):
            # Drop empty-string / "Unnamed" parts that FBref sometimes adds
            parts = [str(c) for c in col if c and "Unnamed" not in str(c)]
            new_cols.append("_".join(parts) if parts else "_".join(str(c) for c in col))
        else:
            new_cols.append(str(col))
    df.columns = new_cols
    return df


def safe_get(row, *candidates, default=0):
    """
    Return the value of the first candidate column name found in row,
    cast to float then to int.  Returns `default` if none found or value
    is NaN/None.
    """
    for name in candidates:
        if name in row.index:
            val = row[name]
            try:
                if pd.isna(val):
                    return default
                return int(float(val))
            except (TypeError, ValueError):
                return default
    return default


def print_available_columns(df: pd.DataFrame, label: str) -> None:
    print(f"\n[DEBUG] Available columns in '{label}' DataFrame:")
    for col in df.columns:
        print(f"    {col!r}")
    if hasattr(df.index, 'names'):
        print(f"    Index levels: {list(df.index.names)}")


# ---------------------------------------------------------------------------
# Column-name candidates (FBref column names vary slightly by season/scrape)
# ---------------------------------------------------------------------------

# Standard stats
GOALS_COLS       = ["Performance_Gls", "Gls", "goals", "Goals"]
ASSISTS_COLS     = ["Performance_Ast", "Ast", "assists", "Assists"]
YELLOW_COLS      = ["Performance_CrdY", "CrdY", "yellow_cards", "YellowCards"]
RED_COLS         = ["Performance_CrdR", "CrdR", "red_cards", "RedCards"]
MINUTES_COLS     = ["Min", "minutes", "Minutes", "Playing Time_Min"]
POSITION_COLS    = ["Pos", "position", "Position"]
STARTED_COLS     = ["Started", "started", "GS"]   # GS = "Games Started" on FBref

# Keeper stats
SAVES_COLS         = ["Performance_Saves", "Saves", "saves", "SV"]
CLEAN_SHEET_COLS   = ["Performance_CS", "CS", "clean_sheets", "CleanSheets"]
GA_COLS            = ["Performance_GA", "GA", "goals_against", "GoalsAgainst"]
PKS_COLS           = ["Penalty Kicks_PKsv", "PKsv", "penalty_saves", "PKSaves",
                      "Penalty Kicks_PKSaves", "pk_saves"]


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def fetch_standard_stats(fbref) -> pd.DataFrame:
    print("[1/4] Fetching standard player match stats (goals, assists, cards, minutes)…")
    try:
        df = fbref.read_player_match_stats(stat_type="summary")
    except Exception:
        # Some versions spell it "standard"
        print("      'summary' failed, trying stat_type='standard'…")
        df = fbref.read_player_match_stats(stat_type="standard")

    df = flatten_columns(df)
    df = df.reset_index()
    print_available_columns(df, "standard stats (after flatten + reset_index)")
    print(f"      Rows fetched: {len(df):,}")
    return df


def fetch_keeper_stats(fbref) -> pd.DataFrame:
    print("[2/4] Fetching keeper match stats (saves, clean sheets, GA, PKsv)…")
    try:
        df = fbref.read_player_match_stats(stat_type="keepers")
    except Exception:
        print("      'keepers' failed, trying stat_type='keeper'…")
        df = fbref.read_player_match_stats(stat_type="keeper")

    df = flatten_columns(df)
    df = df.reset_index()
    print_available_columns(df, "keeper stats (after flatten + reset_index)")
    print(f"      Rows fetched: {len(df):,}")
    return df


def fetch_schedule(fbref) -> pd.DataFrame:
    print("[3/4] Fetching match schedule (dates, home/away teams, scores)…")
    sched = fbref.read_schedule()
    sched = flatten_columns(sched)
    sched = sched.reset_index()
    print_available_columns(sched, "schedule")
    print(f"      Fixtures found: {len(sched):,}")
    return sched


def resolve_player_col(df: pd.DataFrame) -> str:
    """Return the player-name column in df (could be in index or columns)."""
    for candidate in ["player", "Player", "name", "Name"]:
        if candidate in df.columns:
            return candidate
    raise KeyError(
        f"Cannot find a player-name column. Available: {list(df.columns)}"
    )


def resolve_game_col(df: pd.DataFrame) -> str:
    for candidate in ["game", "game_id", "match_id", "fixture"]:
        if candidate in df.columns:
            return candidate
    raise KeyError(
        f"Cannot find a game/match identifier column. Available: {list(df.columns)}"
    )


def build_output(std: pd.DataFrame, keeper: pd.DataFrame, sched: pd.DataFrame) -> pd.DataFrame:
    print("[4/4] Merging and building output CSV…")

    # ------------------------------------------------------------------
    # 1.  Normalise player column name so we have a consistent join key
    # ------------------------------------------------------------------
    player_col_std    = resolve_player_col(std)
    player_col_keeper = resolve_player_col(keeper)
    game_col_std      = resolve_game_col(std)
    game_col_keeper   = resolve_game_col(keeper)

    std   = std.rename(columns={player_col_std:    "player",  game_col_std:    "game_key"})
    keeper= keeper.rename(columns={player_col_keeper: "player", game_col_keeper: "game_key"})

    # ------------------------------------------------------------------
    # 2.  Normalise team column so both frames have "team"
    # ------------------------------------------------------------------
    for df, label in [(std, "std"), (keeper, "keeper")]:
        if "team" not in df.columns:
            for c in ["Team", "squad", "Squad", "club"]:
                if c in df.columns:
                    df.rename(columns={c: "team"}, inplace=True)
                    break

    # ------------------------------------------------------------------
    # 3.  Merge keeper stats onto standard stats
    #     Join on (game_key, player) — use left join so non-GK rows are kept
    # ------------------------------------------------------------------
    keeper_keep_cols = ["game_key", "player"]
    for col_group, default_name in [
        (SAVES_COLS,       "saves"),
        (CLEAN_SHEET_COLS, "cs_raw"),
        (GA_COLS,          "goals_against"),
        (PKS_COLS,         "penalty_saves"),
    ]:
        found = next((c for c in col_group if c in keeper.columns), None)
        if found:
            keeper_keep_cols.append(found)
            if found != default_name:
                keeper = keeper.rename(columns={found: default_name})
                keeper_keep_cols[-1] = default_name

    keeper_slim = keeper[keeper_keep_cols].copy()

    merged = std.merge(keeper_slim, on=["game_key", "player"], how="left")

    # ------------------------------------------------------------------
    # 4.  Attach schedule data (date, home_team, away_team, scores)
    # ------------------------------------------------------------------
    # Identify the schedule game key
    sched_game_col = resolve_game_col(sched)
    sched = sched.rename(columns={sched_game_col: "game_key"})

    # Identify score columns (FBref schedule: home_score / away_score or
    # home_xg / away_xg depending on version; scores live in "Score" too)
    score_cols = []
    for c in sched.columns:
        cl = c.lower()
        if "home_score" in cl or "away_score" in cl or c == "Score":
            score_cols.append(c)

    sched_keep = ["game_key"]
    for candidate in ["home_team", "away_team", "date"]:
        if candidate in sched.columns:
            sched_keep.append(candidate)
        else:
            # fuzzy match
            match = next(
                (c for c in sched.columns if candidate.replace("_", "") in c.lower().replace("_", "")),
                None
            )
            if match:
                sched = sched.rename(columns={match: candidate})
                sched_keep.append(candidate)

    # Parse score from "X–Y" string column if individual columns not present
    if "Score" in sched.columns and "home_score" not in sched.columns:
        def parse_score(s):
            try:
                parts = str(s).replace("–", "-").split("-")
                return int(parts[0].strip()), int(parts[1].strip())
            except Exception:
                return None, None
        sched[["home_score", "away_score"]] = sched["Score"].apply(
            lambda s: pd.Series(parse_score(s))
        )
        sched_keep += ["home_score", "away_score"]
    else:
        for c in ["home_score", "away_score"]:
            if c in sched.columns:
                sched_keep.append(c)

    sched_slim = sched[list(dict.fromkeys(sched_keep))].drop_duplicates("game_key")
    merged = merged.merge(sched_slim, on="game_key", how="left")

    # ------------------------------------------------------------------
    # 5.  Derive cleanSheet for ALL players (not just keepers)
    #     A player's clean sheet = their team conceded 0 in the match.
    #     home team concedes away_score; away team concedes home_score.
    # ------------------------------------------------------------------
    # First ensure we have numeric score columns
    for sc in ["home_score", "away_score"]:
        if sc in merged.columns:
            merged[sc] = pd.to_numeric(merged[sc], errors="coerce")
        else:
            merged[sc] = pd.NA

    def derive_clean_sheet(row):
        team      = str(row.get("team", "")).strip().lower()
        home_team = str(row.get("home_team", "")).strip().lower()
        hs = row.get("home_score")
        as_ = row.get("away_score")
        try:
            if team == home_team:
                return int(float(as_) == 0)
            else:
                return int(float(hs) == 0)
        except (TypeError, ValueError):
            return 0

    # Use keeper-sourced cs_raw if available, else derive from score
    if "cs_raw" in merged.columns:
        merged["cleanSheet"] = merged.apply(
            lambda row: (
                int(float(row["cs_raw"])) if pd.notna(row.get("cs_raw"))
                else derive_clean_sheet(row)
            ),
            axis=1,
        )
    else:
        merged["cleanSheet"] = merged.apply(derive_clean_sheet, axis=1)

    # ------------------------------------------------------------------
    # 6.  Map all output columns
    # ------------------------------------------------------------------
    rows = []
    unmapped = 0

    for _, row in merged.iterrows():
        # date
        raw_date = row.get("date", pd.NaT)
        try:
            match_date = pd.to_datetime(raw_date).strftime("%Y-%m-%d")
        except Exception:
            match_date = ""
            unmapped += 1

        rows.append({
            "matchDate":      match_date,
            "homeTeam":       row.get("home_team", ""),
            "awayTeam":       row.get("away_team", ""),
            "homeScore":      row.get("home_score", ""),
            "awayScore":      row.get("away_score", ""),
            "playerName":     row.get("player", ""),
            "team":           row.get("team", ""),
            "position":       next(
                                  (row[c] for c in POSITION_COLS if c in row.index and pd.notna(row[c])),
                                  ""
                              ),
            "minutesPlayed":  safe_get(row, *MINUTES_COLS),
            "started":        safe_get(row, *STARTED_COLS),
            "goals":          safe_get(row, *GOALS_COLS),
            "assists":        safe_get(row, *ASSISTS_COLS),
            "yellowCards":    safe_get(row, *YELLOW_COLS),
            "redCards":       safe_get(row, *RED_COLS),
            "saves":          safe_get(row, *SAVES_COLS, "saves"),
            "cleanSheet":     int(row.get("cleanSheet", 0) or 0),
            "goalsConceded":  safe_get(row, *GA_COLS, "goals_against"),
            "penaltySaves":   safe_get(row, *PKS_COLS, "penalty_saves"),
        })

    out = pd.DataFrame(rows, columns=[
        "matchDate", "homeTeam", "awayTeam", "homeScore", "awayScore",
        "playerName", "team", "position", "minutesPlayed", "started",
        "goals", "assists", "yellowCards", "redCards",
        "saves", "cleanSheet", "goalsConceded", "penaltySaves",
    ])

    return out, unmapped


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "bsa-2026-stats.csv")

    print("=" * 60)
    print("BGO Fantasy Platform — FBref Brasileirão 2026 Stat Puller")
    print("=" * 60)

    # ------------------------------------------------------------------
    # Import soccerdata (friendly error if not installed)
    # ------------------------------------------------------------------
    try:
        import soccerdata
    except ImportError:
        print("\nERROR: 'soccerdata' is not installed.")
        print("       Run:  pip install soccerdata pandas")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Instantiate FBref scraper
    # ------------------------------------------------------------------
    print("\nInitialising FBref scraper for BRA-Serie A 2026…")
    try:
        fbref = soccerdata.FBref(leagues="BRA-Serie A", seasons=2026)
    except Exception as exc:
        print(f"\nERROR: Failed to initialise FBref scraper: {exc}")
        traceback.print_exc()
        sys.exit(1)

    # ------------------------------------------------------------------
    # Fetch data
    # ------------------------------------------------------------------
    try:
        std = fetch_standard_stats(fbref)
    except Exception as exc:
        print(f"\nERROR: Could not fetch standard player stats: {exc}")
        print("       This may mean FBref has no 2026 Brasileirão data yet,")
        print("       or the site is temporarily unavailable. Try again later.")
        traceback.print_exc()
        sys.exit(1)

    try:
        keeper = fetch_keeper_stats(fbref)
    except Exception as exc:
        print(f"\nWARNING: Could not fetch keeper stats ({exc}). "
              "Keeper columns will be empty.")
        # Build a minimal empty keeper frame so the merge still works
        keeper = pd.DataFrame(columns=["game_key", "player"])

    try:
        sched = fetch_schedule(fbref)
    except Exception as exc:
        print(f"\nWARNING: Could not fetch schedule ({exc}). "
              "Date/score columns will be empty.")
        sched = pd.DataFrame(columns=["game_key", "home_team", "away_team",
                                       "home_score", "away_score", "date"])

    # ------------------------------------------------------------------
    # Build output
    # ------------------------------------------------------------------
    try:
        output_df, unmapped = build_output(std, keeper, sched)
    except Exception as exc:
        print(f"\nERROR: Failed to build output DataFrame: {exc}")
        traceback.print_exc()
        sys.exit(1)

    # ------------------------------------------------------------------
    # Write CSV
    # ------------------------------------------------------------------
    output_df.to_csv(output_path, index=False, encoding="utf-8")
    print(f"\nOutput written to: {output_path}")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    total_rows     = len(output_df)
    fixtures_found = output_df[["homeTeam", "awayTeam", "matchDate"]].drop_duplicates().shape[0]
    missing_dates  = (output_df["matchDate"] == "").sum()
    missing_player = (output_df["playerName"] == "").sum()
    missing_team   = (output_df["team"] == "").sum()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Total player-match rows : {total_rows:,}")
    print(f"  Unique fixtures found   : {fixtures_found:,}")
    print(f"  Rows with missing date  : {missing_dates:,}")
    print(f"  Rows with missing player: {missing_player:,}")
    print(f"  Rows with missing team  : {missing_team:,}")
    print(f"  Unmapped/parse errors   : {unmapped:,}")
    print("=" * 60)

    if total_rows == 0:
        print("\nWARNING: Output CSV is empty — no player stats were found.")
        print("         FBref may not yet have 2026 Brasileirão match reports.")
        sys.exit(1)


if __name__ == "__main__":
    main()
