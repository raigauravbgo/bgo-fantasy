# Requirements: pip install pandas
# Usage:        python scripts/convert-fbref-data.py
# Input:        scripts/data/*.csv  (FBref export files)
# Output:       scripts/bsa-2026-stats.csv  (ready for bulk import)

import os
import sys
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OUTPUT   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bsa-2026-stats.csv")


def load(filename: str) -> pd.DataFrame:
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        print(f"WARNING: {filename} not found, skipping.")
        return pd.DataFrame()
    return pd.read_csv(path, dtype=str).fillna("")


def to_int(val, default=0) -> int:
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return default


def main():
    meta    = load("match_metadata.csv")
    players = load("player_stats.csv")
    gks     = load("gk_stats.csv")

    if meta.empty or players.empty:
        print("ERROR: match_metadata.csv and player_stats.csv are required.")
        sys.exit(1)

    # Build match lookup: match_id → {date, home_team, away_team, home_score, away_score}
    matches = {}
    for _, row in meta.iterrows():
        matches[row["match_id"]] = {
            "date":       row.get("date", ""),
            "home_team":  row.get("home_team", ""),
            "away_team":  row.get("away_team", ""),
            "home_score": to_int(row.get("home_score")),
            "away_score": to_int(row.get("away_score")),
        }

    # Build GK lookup: (match_id, name) → {saves, goals_allowed, penalty_saves}
    gk_lookup: dict[tuple, dict] = {}
    for _, row in gks.iterrows():
        key = (row["match_id"], row["name"].strip().lower())
        gk_lookup[key] = {
            "saves":         to_int(row.get("saves")),
            "goalsConceded": to_int(row.get("goals_allowed")),
            "penaltySaves":  to_int(row.get("penalty_saves") or row.get("pk_saves")),
        }

    rows = []
    unmapped_matches = set()

    for _, p in players.iterrows():
        mid = p["match_id"]
        match = matches.get(mid)
        if not match:
            unmapped_matches.add(mid)
            continue

        minutes = to_int(p.get("minutes"))
        if minutes == 0:
            continue  # did not play

        name = p.get("name", "").strip()
        team = p.get("team", "").strip()
        is_home = team.lower() == match["home_team"].lower()

        # sub_on == "false" means they started (were not a substitute entering the game)
        sub_on = str(p.get("sub_on", "false")).strip().lower()
        started = 1 if sub_on == "false" else 0

        clean_sheet = int(match["away_score"] == 0) if is_home else int(match["home_score"] == 0)

        # GK extras
        gk_key = (mid, name.lower())
        gk = gk_lookup.get(gk_key, {})

        # cleanSheet: 1 if their team conceded 0, using GK-level goals_allowed when available
        if gk:
            gk_clean = int(gk["goalsConceded"] == 0)
        else:
            gk_clean = clean_sheet

        rows.append({
            "matchDate":     match["date"],
            "homeTeam":      match["home_team"],
            "awayTeam":      match["away_team"],
            "homeScore":     match["home_score"],
            "awayScore":     match["away_score"],
            "playerName":    name,
            "team":          team,
            "position":      p.get("pos", ""),
            "minutesPlayed": minutes,
            "started":       started,
            "goals":         to_int(p.get("goals")),
            "assists":       to_int(p.get("assists")),
            "yellowCards":   to_int(p.get("yellow_cards")),
            "redCards":      to_int(p.get("red_cards")),
            "saves":         gk.get("saves", 0),
            "cleanSheet":    gk_clean,
            "goalsConceded": gk.get("goalsConceded", 0),
            "penaltySaves":  gk.get("penaltySaves", 0),
        })

    if not rows:
        print("ERROR: No player rows generated. Check your CSV files.")
        sys.exit(1)

    df = pd.DataFrame(rows, columns=[
        "matchDate", "homeTeam", "awayTeam", "homeScore", "awayScore",
        "playerName", "team", "position", "minutesPlayed", "started",
        "goals", "assists", "yellowCards", "redCards",
        "saves", "cleanSheet", "goalsConceded", "penaltySaves",
    ])

    df.to_csv(OUTPUT, index=False, encoding="utf-8")

    print(f"Output: {OUTPUT}")
    print(f"  Rows:     {len(df)}")
    print(f"  Fixtures: {df[['homeTeam','awayTeam','matchDate']].drop_duplicates().shape[0]}")
    if unmapped_matches:
        print(f"  WARNING: match_ids with no metadata: {unmapped_matches}")

    # Preview
    print("\nFirst 5 rows:")
    print(df.head().to_string(index=False))


if __name__ == "__main__":
    main()
