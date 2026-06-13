import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { getEnv } from "@/config/env";
import type { SoccerRawStats } from "@/domain/adapters/soccer/stats-schema";
import type { Fixture } from "@/domain/models";

const AF_BASE = "https://v3.football.api-sports.io";

const LEAGUE_ID_MAP: Record<string, number> = {
  PL:  39,   // Premier League
  BL1: 78,   // Bundesliga
  PD:  140,  // La Liga
  SA:  135,  // Serie A
  FL1: 61,   // Ligue 1
  DED: 88,   // Eredivisie
  PPL: 94,   // Primeira Liga
  ELC: 40,   // Championship
  BSA: 71,   // Brasileirão
  WC:  1,    // FIFA World Cup
};

type AfPlayer = {
  player: { id: number; name: string };
  statistics: Array<{
    games: { minutes: number | null; rating: string | null; captain: boolean; substitute: boolean };
    goals: { total: number | null; assists: number | null; saves: number | null; conceded: number | null };
    cards: { yellow: number; red: number };
    penalty: { saved: number | null; missed: number | null };
    fouls: { committed: number | null };
  }>;
};

type AfFixture = {
  fixture: { id: number; date: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  score: { fulltime: { home: number | null; away: number | null } };
};

export type PlayerMapping = {
  apiName: string;
  apiTeamName: string;
  side: "home" | "away";
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  dbName: string;
  dbTeamShortName?: string;
  matchType: "exact" | "lastname";
};

// Strip diacritics: "Álvarez"=="Alvarez", "Jiménez"=="Jimenez"
function normName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

async function afFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${AF_BASE}${path}`, { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) throw new RequestError(`API-Football: ${res.status} ${await res.text()}`, 502);
  const data = await res.json() as { response: T; errors: unknown };
  const hasErrors =
    (Array.isArray(data.errors) && data.errors.length > 0) ||
    (data.errors !== null && typeof data.errors === "object" && !Array.isArray(data.errors) &&
      Object.keys(data.errors as object).length > 0);
  if (hasErrors) throw new RequestError(`API-Football error: ${JSON.stringify(data.errors)}`, 502);
  if (data.response === undefined) throw new RequestError(`API-Football returned unexpected response for ${path}`, 502);
  return data.response;
}

function mapStats(afPlayer: AfPlayer, cleanSheet: boolean): SoccerRawStats {
  const s = afPlayer.statistics[0];
  if (!s) return {};
  const minutes = s.games.minutes ?? 0;
  return {
    started: !s.games.substitute && minutes > 0,
    substituteAppearance: s.games.substitute && minutes > 0,
    minutesPlayed: minutes,
    goals: s.goals.total ?? 0,
    assists: s.goals.assists ?? 0,
    cleanSheet,
    goalsConceded: s.goals.conceded ?? 0,
    saves: s.goals.saves ?? 0,
    penaltySaves: s.penalty.saved ?? 0,
    penaltyMisses: s.penalty.missed ?? 0,
    yellowCards: s.cards.yellow ?? 0,
    redCards: s.cards.red ?? 0,
  };
}

type MatchResult = {
  afFixtureId: number;
  homeGoals: number;
  awayGoals: number;
  mappings: PlayerMapping[];
  unmapped: string[];
  statItems: Array<{
    competitionId: string; fixtureId: string; playerId: string;
    source: "provider"; stats: SoccerRawStats;
  }>;
};

async function resolveMatchings(fixtureId: string, fixture: Fixture, apiKey: string): Promise<MatchResult> {
  const repo = platformRepository();
  const competition = await repo.competitions.findById(fixture.competitionId);
  const leagueCode = competition?.settings?.leagueCode;
  const leagueId = leagueCode ? LEAGUE_ID_MAP[leagueCode] : undefined;
  if (!leagueId) throw new RequestError(
    `No API-Football league ID mapped for league code: ${leagueCode ?? "unknown"}.`, 400
  );

  const utcDate = new Date(fixture.startTime).toISOString().slice(0, 10);
  const nextDay = new Date(new Date(fixture.startTime).getTime() + 86_400_000).toISOString().slice(0, 10);
  const datesToTry = Array.from(new Set([utcDate, nextDay]));
  const season = new Date(fixture.startTime).getUTCFullYear();

  const allAfFixtures: AfFixture[] = [];
  const queryErrors: string[] = [];
  for (const d of datesToTry) {
    try {
      const dayFixtures = await afFetch<AfFixture[]>(`/fixtures?league=${leagueId}&season=${season}&date=${d}`, apiKey);
      for (const f of dayFixtures) {
        if (!allAfFixtures.some((x) => x.fixture.id === f.fixture.id)) allAfFixtures.push(f);
      }
    } catch (err) {
      queryErrors.push(`${d}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (allAfFixtures.length === 0 && queryErrors.length === datesToTry.length) {
    throw new RequestError(`API-Football returned no fixtures. Errors: ${queryErrors.join(" | ")}`, 502);
  }

  const t1 = (fixture.team1Name ?? "").toLowerCase();
  const t2 = (fixture.team2Name ?? "").toLowerCase();
  const matched = allAfFixtures.find((af) => {
    const home = af.teams.home.name.toLowerCase();
    const away = af.teams.away.name.toLowerCase();
    return (
      (home.includes(t1.split(" ")[0]) || t1.includes(home.split(" ")[0])) &&
      (away.includes(t2.split(" ")[0]) || t2.includes(away.split(" ")[0]))
    );
  });
  if (!matched) {
    const available = allAfFixtures.map((af) => `${af.teams.home.name} vs ${af.teams.away.name}`).join(", ");
    throw new RequestError(
      `Could not match fixture "${fixture.team1Name} vs ${fixture.team2Name}". Available: ${available || "none"}`, 404
    );
  }

  const afFixtureId = matched.fixture.id;
  const ftScore = matched.score.fulltime;
  const homeGoals = ftScore.home ?? 0;
  const awayGoals = ftScore.away ?? 0;

  const teamStats = await afFetch<Array<{ team: { id: number; name: string }; players: AfPlayer[] }>>(
    `/fixtures/players?fixture=${afFixtureId}`, apiKey
  );

  const players = await repo.players.list(fixture.competitionId);
  const byNorm = new Map(players.map((p) => [normName(p.name), p]));
  const byTeamNorm = new Map<string, typeof players>();
  for (const p of players) {
    const arr = byTeamNorm.get(p.teamId) ?? [];
    arr.push(p);
    byTeamNorm.set(p.teamId, arr);
  }

  function findPlayer(afName: string, dbTeamId: string): { player: typeof players[0]; matchType: "exact" | "lastname" } | undefined {
    const n = normName(afName);
    const exact = byNorm.get(n);
    if (exact) return { player: exact, matchType: "exact" };
    const lastName = n.split(" ").pop() ?? "";
    if (!lastName) return undefined;
    for (const p of byTeamNorm.get(dbTeamId) ?? []) {
      const pn = normName(p.name);
      const pLast = pn.split(" ").pop() ?? "";
      if (pLast === lastName || pn.includes(lastName) || lastName.includes(pLast)) {
        return { player: p, matchType: "lastname" };
      }
    }
    return undefined;
  }

  const mappings: PlayerMapping[] = [];
  const unmapped: string[] = [];
  const statItems: MatchResult["statItems"] = [];

  for (const group of teamStats) {
    const isHome = group.team.id === matched.teams.home.id;
    const dbTeamId = isHome ? fixture.team1Id : fixture.team2Id;
    const cleanSheet = isHome ? awayGoals === 0 : homeGoals === 0;

    for (const afPlayer of group.players) {
      const s = afPlayer.statistics[0];
      if (!s || (s.games.minutes ?? 0) === 0) continue;

      const found = findPlayer(afPlayer.player.name, dbTeamId);
      if (!found) { unmapped.push(afPlayer.player.name); continue; }

      const { player, matchType } = found;
      mappings.push({
        apiName: afPlayer.player.name,
        apiTeamName: group.team.name,
        side: isHome ? "home" : "away",
        minutes: s.games.minutes ?? 0,
        goals: s.goals.total ?? 0,
        assists: s.goals.assists ?? 0,
        yellowCards: s.cards.yellow ?? 0,
        redCards: s.cards.red ?? 0,
        dbName: player.name,
        dbTeamShortName: player.teamShortName,
        matchType,
      });

      statItems.push({
        competitionId: fixture.competitionId,
        fixtureId,
        playerId: player.id,
        source: "provider",
        stats: mapStats(afPlayer, cleanSheet),
      });
    }
  }

  return { afFixtureId, homeGoals, awayGoals, mappings, unmapped, statItems };
}

// ─── GET: pure preview — no DB writes ─────────────────────────────────────────
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id: fixtureId } = await context.params;
    const apiKey = getEnv().APIFOOTBALL_API_KEY;
    if (!apiKey) throw new RequestError("APIFOOTBALL_API_KEY env var not set", 500);
    const repo = platformRepository();
    const fixture = await repo.fixtures.findById(fixtureId);
    if (!fixture) throw new RequestError("Fixture not found", 404);

    const { afFixtureId, homeGoals, awayGoals, mappings, unmapped } =
      await resolveMatchings(fixtureId, fixture, apiKey);

    return json({
      preview: true,
      afFixtureId,
      score: { home: homeGoals, away: awayGoals },
      mapped: mappings.length,
      unmapped: unmapped.length,
      unmappedNames: unmapped,
      fuzzyCount: mappings.filter((m) => m.matchType === "lastname").length,
      mappings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── POST: fetch from API + save raw stats — does NOT publish points ───────────
//
// This is step 1 of the two-phase flow:
//   POST /fetch-live  →  saves raw stats, returns full mapping table + score
//   POST /publish     →  admin confirms, publishes points, marks fixture complete
//
// Keeping these steps separate lets the admin review every mapping and the score
// before any leaderboard changes are made.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id: fixtureId } = await context.params;
    const apiKey = getEnv().APIFOOTBALL_API_KEY;
    if (!apiKey) throw new RequestError("APIFOOTBALL_API_KEY env var not set", 500);

    const repo = platformRepository();
    const fixture = await repo.fixtures.findById(fixtureId);
    if (!fixture) throw new RequestError("Fixture not found", 404);

    const { afFixtureId, homeGoals, awayGoals, mappings, unmapped, statItems } =
      await resolveMatchings(fixtureId, fixture, apiKey);

    if (statItems.length === 0) {
      throw new RequestError("No matching players found. Import league data first.", 422);
    }

    // Save raw stats only — points are NOT published yet
    await repo.rawStats.upsertMany(statItems);

    // Store the API score on the fixture so publish can use it, but keep status as-is
    await repo.fixtures.update(fixtureId, {
      score: { team1: homeGoals, team2: awayGoals },
    });

    await repo.audit.create({
      actorUserId: admin.id,
      action: "stats.fetched",
      entityType: "fixture",
      competitionId: fixture.competitionId,
      entityId: fixtureId,
      after: {
        afFixtureId,
        score: `${homeGoals}-${awayGoals}`,
        mapped: statItems.length,
        unmapped: unmapped.length,
        unmappedNames: unmapped.slice(0, 10),
        fuzzyMappings: mappings
          .filter((m) => m.matchType === "lastname")
          .map((m) => `${m.apiName} → ${m.dbName}`),
      },
    });

    return json({
      statsSaved: true,
      afFixtureId,
      score: { home: homeGoals, away: awayGoals },
      mapped: statItems.length,
      unmapped: unmapped.length,
      unmappedNames: unmapped,
      fuzzyCount: mappings.filter((m) => m.matchType === "lastname").length,
      fuzzyMappings: mappings
        .filter((m) => m.matchType === "lastname")
        .map((m) => `${m.apiName} → ${m.dbName}`),
      mappings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
