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

// API-Football team names → our TLA (football-data.org standard codes).
const NAME_TO_TLA: Record<string, string> = {
  // API-Football name variants
  "turkiye": "TUR", "turkey": "TUR",
  "ivory coast": "CIV", "cote d ivoire": "CIV", "cote divoire": "CIV",
  "cape verde islands": "CPV", "cape verde": "CPV",
  "dr congo": "COD", "democratic republic of the congo": "COD",
  "ir iran": "IRN", "iran": "IRN",
  "korea republic": "KOR", "south korea": "KOR",
  "chinese taipei": "TPE",
  "curacao": "CUW",
  "republic of ireland": "IRL", "northern ireland": "NIR",
  "united states": "USA", "usa": "USA",
  "czech republic": "CZE", "czechia": "CZE",
  "bosnia and herzegovina": "BIH", "bosnia": "BIH",
  "saudi arabia": "KSA",
  "south africa": "RSA",
  "netherlands": "NED", "holland": "NED",
  "new zealand": "NZL",
  "trinidad and tobago": "TTO",
  "costa rica": "CRC",
  "el salvador": "SLV",
  "north korea": "PRK",
  "china pr": "CHN", "china": "CHN",
  // Standard names that football-data.org TLAs differ from 3-letter name
  "mexico": "MEX", "spain": "ESP", "france": "FRA", "germany": "GER",
  "brazil": "BRA", "argentina": "ARG", "portugal": "POR", "england": "ENG",
  "belgium": "BEL", "croatia": "CRO", "denmark": "DEN", "switzerland": "SUI",
  "uruguay": "URU", "senegal": "SEN", "morocco": "MAR", "cameroon": "CMR",
  "nigeria": "NGA", "ghana": "GHA", "egypt": "EGY", "algeria": "ALG",
  "mali": "MLI", "guinea": "GUI", "tunisia": "TUN", "ethiopia": "ETH",
  "australia": "AUS", "japan": "JPN", "qatar": "QAT", "canada": "CAN",
  "scotland": "SCO", "wales": "WAL", "poland": "POL", "ukraine": "UKR",
  "austria": "AUT", "serbia": "SRB", "romania": "ROU", "albania": "ALB",
  "georgia": "GEO", "slovakia": "SVK", "slovenia": "SVN",
  "colombia": "COL", "ecuador": "ECU", "paraguay": "PAR", "peru": "PER",
  "chile": "CHI", "venezuela": "VEN", "bolivia": "BOL",
  "honduras": "HON", "panama": "PAN", "jamaica": "JAM", "haiti": "HAI",
  "iraq": "IRQ", "norway": "NOR", "sweden": "SWE", "indonesia": "IDN",
  "uzbekistan": "UZB", "thailand": "THA", "vietnam": "VIE",
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

    // Build a lookup keyed by both TLA and normalised full name so either can match.
    const afByKey = new Map<string, number>();
    for (const af of afFixtures) {
      const date = new Date(af.fixture.date).toISOString().slice(0, 10);
      const homeTla = teamToTla(af.teams.home.name);
      const awayTla = teamToTla(af.teams.away.name);
      afByKey.set(`${date}|${homeTla}|${awayTla}`, af.fixture.id);
      // Also store by normalised full name for cases where TLA lookup fails
      const homeNorm = normName(af.teams.home.name);
      const awayNorm = normName(af.teams.away.name);
      if (homeNorm !== homeTla || awayNorm !== awayTla) {
        afByKey.set(`${date}|${homeNorm}|${awayNorm}`, af.fixture.id);
      }
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

      const n1 = normName(fix.team1Name ?? "");
      const n2 = normName(fix.team2Name ?? "");

      // Try same date first, then ±1 day (for timezone edge cases)
      let afId: number | undefined;
      for (let offset = 0; offset <= 1 && !afId; offset++) {
        const d = new Date(new Date(fix.startTime).getTime() + offset * 86_400_000).toISOString().slice(0, 10);
        afId = afByKey.get(`${d}|${tla1}|${tla2}`)       // TLA match
            ?? afByKey.get(`${d}|${n1}|${n2}`)            // full-name match
            ?? afByKey.get(`${d}|${tla1}|${n2}`)          // mixed
            ?? afByKey.get(`${d}|${n1}|${tla2}`);         // mixed
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
