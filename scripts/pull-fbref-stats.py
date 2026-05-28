# Requirements: pip install requests pandas beautifulsoup4 lxml
# Usage:        python scripts/pull-fbref-stats.py
# Output:       scripts/bsa-2026-stats.csv
#
# Scrapes FBref match report pages for Brasileirão Série A 2026.
# Sleeps 4 s between requests to respect FBref's crawl rate.

import sys
import time
import re
import os

import requests
import pandas as pd
from bs4 import BeautifulSoup

BASE = "https://fbref.com"
SCHEDULE_URL = f"{BASE}/en/comps/24/2026/schedule/2026-Serie-A-Scores-and-Fixtures"
DELAY = 4  # seconds between page fetches
OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bsa-2026-stats.csv")

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
})


def fetch(url: str) -> BeautifulSoup:
    resp = SESSION.get(url, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "lxml")


def parse_score(score_str: str):
    """'2–1' or '2-1' → (2, 1). Returns (None, None) on failure."""
    try:
        s = str(score_str).replace("–", "-").replace("—", "-").strip()
        parts = re.split(r"[-–]", s)
        return int(parts[0].strip()), int(parts[1].strip())
    except Exception:
        return None, None


def get_schedule() -> list[dict]:
    """Return list of completed matches with date, teams, score, report URL."""
    print(f"Fetching schedule from {SCHEDULE_URL} …")
    soup = fetch(SCHEDULE_URL)

    table = soup.find("table", {"id": re.compile(r"sched_")})
    if not table:
        raise RuntimeError("Could not find schedule table on FBref page.")

    matches = []
    for row in table.find("tbody").find_all("tr"):
        if row.get("class") and "spacer" in " ".join(row.get("class")):
            continue

        cells = {td.get("data-stat"): td for td in row.find_all(["td", "th"])}
        if not cells:
            continue

        score_cell = cells.get("score")
        if not score_cell or not score_cell.get_text(strip=True):
            continue  # not yet played

        report_link = score_cell.find("a", href=True)
        if not report_link:
            continue

        date_cell = cells.get("date")
        date_str = date_cell.get_text(strip=True) if date_cell else ""

        home_cell = cells.get("home_team") or cells.get("squad_a")
        away_cell = cells.get("away_team") or cells.get("squad_b")
        home_name = home_cell.get_text(strip=True) if home_cell else ""
        away_name = away_cell.get_text(strip=True) if away_cell else ""

        score_text = score_cell.get_text(strip=True)
        home_score, away_score = parse_score(score_text)

        matches.append({
            "date": date_str,
            "home": home_name,
            "away": away_name,
            "home_score": home_score,
            "away_score": away_score,
            "report_url": BASE + report_link["href"],
        })

    print(f"  Found {len(matches)} completed fixtures.")
    return matches


def parse_match_stats(soup: BeautifulSoup, match: dict) -> list[dict]:
    """Extract per-player stats from a match report page."""
    rows = []

    # FBref match pages have tables with id pattern: stats_TEAMID_summary / stats_TEAMID_keeper
    summary_tables = soup.find_all("table", {"id": re.compile(r"stats_.+_summary")})
    keeper_tables  = soup.find_all("table", {"id": re.compile(r"stats_.+_keeper")})

    # Build keeper lookup keyed by player name → {saves, cs, ga, pk_saves}
    keeper_lookup: dict[str, dict] = {}
    for ktable in keeper_tables:
        for kr in ktable.find("tbody").find_all("tr"):
            if kr.get("class") and "spacer" in " ".join(kr.get("class") or []):
                continue
            kc = {td.get("data-stat"): td.get_text(strip=True) for td in kr.find_all(["td", "th"])}
            pname = kc.get("player", "").strip()
            if not pname or pname.lower() in ("player", ""):
                continue
            keeper_lookup[pname.lower()] = {
                "saves":         _int(kc.get("gk_saves")),
                "cleanSheet":    _int(kc.get("gk_clean_sheets")) > 0,
                "goalsConceded": _int(kc.get("gk_goals_against_gk") or kc.get("gk_goals_against")),
                "penaltySaves":  _int(kc.get("gk_pens_saved")),
            }

    for i, table in enumerate(summary_tables):
        # Team name: try caption or table id
        team_name = ""
        caption = table.find("caption")
        if caption:
            team_name = caption.get_text(strip=True).replace(" Player Stats Table", "").strip()

        is_home = (i == 0)  # first summary table = home team

        for tr in table.find("tbody").find_all("tr"):
            cls = " ".join(tr.get("class") or [])
            if "spacer" in cls or "thead" in cls:
                continue

            c = {td.get("data-stat"): td.get_text(strip=True) for td in tr.find_all(["td", "th"])}
            pname = c.get("player", "").strip()
            if not pname or pname.lower() in ("player", ""):
                continue

            minutes_raw = c.get("minutes") or c.get("min") or "0"
            minutes = _int(re.sub(r"[^\d]", "", minutes_raw))
            if minutes == 0:
                continue  # did not play

            # starter: FBref marks substitute rows differently — check "game_started"
            started_raw = c.get("game_started") or c.get("started") or ""
            started = 1 if started_raw in ("1", "Y", "Yes", "*") else 0
            if not started_raw:
                # fallback: if minutes >= 45 assume started
                started = 1 if minutes >= 45 else 0

            clean_sheet_for_team = (match["away_score"] == 0) if is_home else (match["home_score"] == 0)

            kstat = keeper_lookup.get(pname.lower(), {})

            rows.append({
                "matchDate":    match["date"],
                "homeTeam":     match["home"],
                "awayTeam":     match["away"],
                "homeScore":    match["home_score"] if match["home_score"] is not None else "",
                "awayScore":    match["away_score"] if match["away_score"] is not None else "",
                "playerName":   pname,
                "team":         team_name,
                "position":     c.get("position") or c.get("pos") or "",
                "minutesPlayed": minutes,
                "started":      started,
                "goals":        _int(c.get("goals") or c.get("gls")),
                "assists":      _int(c.get("assists") or c.get("ast")),
                "yellowCards":  _int(c.get("cards_yellow") or c.get("crdy")),
                "redCards":     _int(c.get("cards_red") or c.get("crdr")),
                "saves":        kstat.get("saves", 0),
                "cleanSheet":   int(kstat.get("cleanSheet", clean_sheet_for_team)),
                "goalsConceded":kstat.get("goalsConceded", 0),
                "penaltySaves": kstat.get("penaltySaves", 0),
            })

    return rows


def _int(val) -> int:
    try:
        return int(float(str(val).strip() or "0"))
    except (ValueError, TypeError):
        return 0


def main():
    print("=" * 60)
    print("BGO Fantasy — FBref Brasileirão 2026 Stat Puller (direct)")
    print("=" * 60)

    try:
        matches = get_schedule()
    except Exception as exc:
        print(f"\nERROR fetching schedule: {exc}")
        sys.exit(1)

    if not matches:
        print("No completed matches found. Nothing to do.")
        sys.exit(0)

    all_rows: list[dict] = []
    failed: list[str] = []

    for idx, match in enumerate(matches, 1):
        label = f"{match['home']} vs {match['away']} ({match['date']})"
        print(f"[{idx:3d}/{len(matches)}] {label} …", end=" ", flush=True)

        try:
            time.sleep(DELAY)
            soup = fetch(match["report_url"])
            rows = parse_match_stats(soup, match)
            all_rows.extend(rows)
            print(f"{len(rows)} players")
        except Exception as exc:
            print(f"FAILED ({exc})")
            failed.append(label)

    if not all_rows:
        print("\nERROR: No player stats extracted.")
        print("FBref may not have detailed match reports for BSA 2026 yet.")
        sys.exit(1)

    df = pd.DataFrame(all_rows, columns=[
        "matchDate", "homeTeam", "awayTeam", "homeScore", "awayScore",
        "playerName", "team", "position", "minutesPlayed", "started",
        "goals", "assists", "yellowCards", "redCards",
        "saves", "cleanSheet", "goalsConceded", "penaltySaves",
    ])
    df.to_csv(OUTPUT, index=False, encoding="utf-8")

    print(f"\nOutput: {OUTPUT}")
    print("=" * 60)
    print(f"  Total player-match rows : {len(df):,}")
    print(f"  Unique fixtures         : {df[['homeTeam','awayTeam','matchDate']].drop_duplicates().shape[0]:,}")
    if failed:
        print(f"  Failed fixtures ({len(failed)})  : {'; '.join(failed[:5])}" + (" …" if len(failed) > 5 else ""))
    print("=" * 60)


if __name__ == "__main__":
    main()
