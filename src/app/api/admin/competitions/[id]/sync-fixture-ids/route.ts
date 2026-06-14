// Fetches ALL API-Football fixtures for a competition's league and stores
// the API-Football fixture ID in each DB fixture's providerIds field.
// After this runs, fetch-live uses stored IDs directly — no name matching needed.

import { type NextRequest } from "next/server";
import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { getEnv } from "@/config/env";

const AF_BASE = "https://v3.football.api-sports.io";

const LEAGUE_ID_MAP: Record<string, number> = {
  PL: 39, BL1: 78, PD: 140, SA: 135, FL1: 61,
  DED: 88, PPL: 94, ELC: 40, BSA: 71, WC: 1,
};

// Both API-Football names AND football-data.org names → our TLA.
// Covers cases where the two data sources use completely different names.
const NAME_TO_TLA: Record<string, string> = {
  // API-Football → TLA
  "turkiye": "TUR",
  "ivory coast": "CIV",
  "cape verde islands": "CPV",
  "dr congo": "COD",
  "ir iran": "IRN",
  "korea republic": "KOR",
  "south korea": "KOR",
  "chinese taipei": "TPE",
  "curacao": "CUW",
  // football-data.org → TLA
  "turkey": "TUR",
  "cote d ivoire": "CIV",
  "cote divoire": "CIV",
  "cape verde": "CPV",
  "democratic republic of the congo": "COD",
  "iran": "IRN",
  "republic of ireland": "IRL",
  "northern ireland": "NIR",
  "united states": "USA",
};

function normName(s: string): string {
  return s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().trim();
}

function teamToTla(name: string, knownTla?: string): string {
  if (knownTla) return knownTla.toUpperCase();
  const n = normName(name);
  // Check alias map
  if (NAME_TO_TLA[n]) return NAME_TO_TLA[n];
  // Replace apostrophes/hyphens and re-check
  const clean = n.replace(/['\-]/g, " ").replace(/\s+/g, " ").trim();
  if (NAME_TO_TLA[clean]) return NAME_TO_TLA[clean];
  // If name is a short code (≤4 uppercase chars) treat it as TLA
  if (/^[A-Z]{2,4}$/.test(name)) return name;
  return n; // fall back to normalized name
}

async function afFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${AF_BASE}${path}`, { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  const body = await res.json() as { response: T; errors: unknown };
  if (body.errors && typeof body.errors === "object" && Object.keys(body.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(body.errors)}`);
  }
  return body.response;
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id: competitionId } = await context.params;
    const apiKey = getEnv().APIFOOTBALL_API_KEY;
    if (!apiKey) throw new RequestError("APIFOOTBALL_API_KEY env var not set", 500);

    const repo = platformRepository();
    const competition = await repo.competitions.findById(competitionId);
    if (!competition) throw new RequestError("Competition not found", 404);

    const leagueCode = competition.settings?.leagueCode;
    const leagueId = leagueCode ? LEAGUE_ID_MAP[leagueCode] : undefined;
    if (!leagueId) throw new RequestError(`No API-Football league mapped for: ${leagueCode ?? "unknown"}`, 400);

    const season = leagueCode === "WC" ? 2026 : new Date().getFullYear();

    // Fetch ALL fixtures for the competition from API-Football in one call
    const afFixtures = await afFetch<Array<{
      fixture: { id: number; date: string };
      teams: { home: { id: number; name: string }; away: { id: number; name: string } };
    }>>(`/fixtures?league=${leagueId}&season=${season}`, apiKey);

    if (!afFixtures.length) throw new RequestError("API-Football returned no fixtures", 502);

    // Build a lookup: "YYYY-MM-DD|HOME_TLA|AWAY_TLA" → AF fixture ID
    const afByKey = new Map<string, number>();
    for (const af of afFixtures) {
      const date = new Date(af.fixture.date).toISOString().slice(0, 10);
      const home = teamToTla(af.teams.home.name);
      const away = teamToTla(af.teams.away.name);
      afByKey.set(`${date}|${home}|${away}`, af.fixture.id);
    }

    const dbFixtures = await repo.fixtures.list(competitionId);

    let matched = 0;
    let alreadyMapped = 0;
    const unmatched: string[] = [];

    for (const fix of dbFixtures) {
      // Skip if already mapped
      if ((fix.providerIds as Record<string, string> | null)?.apifootball) {
        alreadyMapped++;
        continue;
      }

      const date = new Date(fix.startTime).toISOString().slice(0, 10);
      const tla1 = teamToTla(fix.team1Name ?? "", fix.team1ShortName);
      const tla2 = teamToTla(fix.team2Name ?? "", fix.team2ShortName);

      // Try same date first, then ±1 day (for timezone edge cases)
      let afId: number | undefined;
      for (let offset = 0; offset <= 1 && !afId; offset++) {
        const d = new Date(new Date(fix.startTime).getTime() + offset * 86_400_000).toISOString().slice(0, 10);
        afId = afByKey.get(`${d}|${tla1}|${tla2}`);
      }

      if (afId) {
        await repo.fixtures.update(fix.id, {
          providerIds: { ...(fix.providerIds as Record<string, string> ?? {}), apifootball: String(afId) }
        });
        matched++;
      } else {
        unmatched.push(`${fix.team1ShortName ?? fix.team1Name} vs ${fix.team2ShortName ?? fix.team2Name} (${date}) [tla: ${tla1}|${tla2}]`);
      }
    }

    return json({
      total: dbFixtures.length,
      matched,
      alreadyMapped,
      unmatched: unmatched.length,
      unmatchedList: unmatched.slice(0, 20),
      afFixturesReceived: afFixtures.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
