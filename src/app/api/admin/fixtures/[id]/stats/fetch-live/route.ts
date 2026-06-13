import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { calculateFixtureScoring } from "@/server/services/scoring";
import { scorePredictionSet } from "@/server/services/predictions";
import { getEnv } from "@/config/env";
import type { SoccerRawStats } from "@/domain/adapters/soccer/stats-schema";

const AF_BASE = "https://v3.football.api-sports.io";

// football-data.org league code → API-Football league ID
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
  score: {
    fulltime: { home: number | null; away: number | null };
  };
};

// Strip diacritics so "Álvarez"=="Alvarez", "Jiménez"=="Jimenez", etc.
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

async function afFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${AF_BASE}${path}`, {
    headers: { "x-apisports-key": apiKey }
  });
  if (!res.ok) throw new RequestError(`API-Football: ${res.status} ${await res.text()}`, 502);
  const data = await res.json() as { response: T; errors: unknown };
  // API-Football returns errors as either an array or a non-empty object
  const hasErrors =
    (Array.isArray(data.errors) && data.errors.length > 0) ||
    (data.errors !== null && typeof data.errors === "object" && !Array.isArray(data.errors) && Object.keys(data.errors as object).length > 0);
  if (hasErrors) {
    throw new RequestError(`API-Football error: ${JSON.stringify(data.errors)}`, 502);
  }
  if (data.response === undefined) {
    throw new RequestError(`API-Football returned unexpected response for ${path}`, 502);
  }
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
    // Allow upcoming/live fixtures — admin knows the match is done; we'll mark completed after fetching

    // Get competition to find league code
    const competition = await repo.competitions.findById(fixture.competitionId);
    const leagueCode = competition?.settings?.leagueCode;
    const leagueId = leagueCode ? LEAGUE_ID_MAP[leagueCode] : undefined;
    if (!leagueId) throw new RequestError(
      `No API-Football league ID mapped for league code: ${leagueCode ?? "unknown"}. Set leagueCode in competition settings by importing a league first.`,
      400
    );

    // Find the matching API-Football fixture by date + league.
    // Fixtures stored in UTC may fall on a different calendar date locally (e.g. UTC-3 Brazil),
    // so we query the UTC date AND the next day, then deduplicate by fixture id.
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
          if (!allAfFixtures.some((x) => x.fixture.id === f.fixture.id)) {
            allAfFixtures.push(f);
          }
        }
      } catch (err) {
        queryErrors.push(`${d}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // If all date queries failed, surface the actual API errors
    if (allAfFixtures.length === 0 && queryErrors.length === datesToTry.length) {
      throw new RequestError(`API-Football returned no fixtures for league ${leagueId} season ${season}. Errors: ${queryErrors.join(" | ")}`, 502);
    }

    // Match by team name similarity
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
        `Could not match fixture "${fixture.team1Name} vs ${fixture.team2Name}" on dates ${datesToTry.join(", ")}. Available: ${available || "none"}`,
        404
      );
    }

    const afFixtureId = matched.fixture.id;
    const ftScore = matched.score.fulltime;

    // Fetch player stats — response is [{team: {id, name}, players: [...]}, ...]
    const teamStats = await afFetch<Array<{ team: { id: number; name: string }; players: AfPlayer[] }>>(
      `/fixtures/players?fixture=${afFixtureId}`,
      apiKey
    );

    // Determine clean sheet — team kept a clean sheet if opponent scored 0
    const homeGoals = ftScore.home ?? 0;
    const awayGoals = ftScore.away ?? 0;

    const players = await repo.players.list(fixture.competitionId);
    // Index by normalized name for fast exact lookups
    const byNorm = new Map(players.map((p) => [norm(p.name), p]));

    // Build per-team player lists (normalized) for scoped last-name fallback
    const byTeamNorm = new Map<string, typeof players>();
    for (const p of players) {
      const arr = byTeamNorm.get(p.teamId) ?? [];
      arr.push(p);
      byTeamNorm.set(p.teamId, arr);
    }

    // Find a DB player matching an API-Football name, scoped to one team.
    // 1. Exact normalized match (any team — handles cross-team unique names)
    // 2. Last-name match restricted to dbTeamId (prevents Álvarez ARG → Álvarez MEX)
    function findPlayer(afName: string, dbTeamId: string) {
      const n = norm(afName);
      if (byNorm.has(n)) return byNorm.get(n);
      const lastName = n.split(" ").pop() ?? "";
      if (!lastName) return undefined;
      for (const p of byTeamNorm.get(dbTeamId) ?? []) {
        const pn = norm(p.name);
        const pLast = pn.split(" ").pop() ?? "";
        if (pLast === lastName || pn.includes(lastName) || lastName.includes(pLast)) return p;
      }
      return undefined;
    }

    const statItems: Array<{ competitionId: string; fixtureId: string; playerId: string; source: "provider"; stats: SoccerRawStats }> = [];
    const unmapped: string[] = [];

    // Iterate by team group so we know home vs away for clean-sheet calc
    // and can scope player name matching to the correct team
    for (const group of teamStats) {
      const isHome = group.team.id === matched.teams.home.id;
      const dbTeamId = isHome ? fixture.team1Id : fixture.team2Id;
      const cleanSheet = isHome ? awayGoals === 0 : homeGoals === 0;

      for (const afPlayer of group.players) {
        const s = afPlayer.statistics[0];
        if (!s || (s.games.minutes ?? 0) === 0) continue; // skip DNP

        const player = findPlayer(afPlayer.player.name, dbTeamId);
        if (!player) { unmapped.push(afPlayer.player.name); continue; }

        statItems.push({
          competitionId: fixture.competitionId,
          fixtureId,
          playerId: player.id,
          source: "provider",
          stats: mapStats(afPlayer, cleanSheet)
        });
      }
    }

    if (statItems.length === 0) {
      throw new RequestError("No matching players found. Import league data first so player names are in the DB.", 422);
    }

    await repo.rawStats.upsertMany(statItems);

    // Auto-publish points using the score we already have
    const [rawStats, allPlayers, entries] = await Promise.all([
      repo.rawStats.listByFixture(fixtureId),
      repo.players.list(fixture.competitionId),
      repo.entries.list(fixture.competitionId)
    ]);

    const scoring = calculateFixtureScoring({
      competitionId: fixture.competitionId,
      fixtureId,
      rawStats,
      players: allPlayers,
      entries,
      actorUserId: admin.id,
      status: "published"
    });

    await repo.points.replaceFixturePoints({
      competitionId: fixture.competitionId,
      fixtureId,
      ...scoring
    });

    const updatedFixture = {
      ...fixture,
      status: "completed" as const,
      score: { team1: homeGoals, team2: awayGoals },
      result: {
        winnerTeamId: homeGoals > awayGoals
          ? fixture.team1Id
          : awayGoals > homeGoals
            ? fixture.team2Id
            : "draw"
      }
    };

    await repo.fixtures.update(fixtureId, {
      status: updatedFixture.status,
      score: updatedFixture.score,
      result: updatedFixture.result,
    });

    // Auto-score any open/closed prediction sets for this fixture
    const allSets = await repo.predictions.listSets(fixture.competitionId);
    const fixtureSets = allSets.filter(
      (s) => s.fixtureId === fixtureId && (s.status === "open" || s.status === "closed")
    );
    if (fixtureSets.length > 0) {
      const allPredictions = await repo.predictions.listUserPredictions(fixture.competitionId);
      const fixtureStats = {
        homeGoals,
        awayGoals,
        hasRedCard: statItems.some((si) => (si.stats.redCards ?? 0) > 0),
      };
      for (const set of fixtureSets) {
        const results = scorePredictionSet({
          set,
          fixture: updatedFixture,
          predictions: allPredictions,
          stats: fixtureStats,
        });
        if (results.length > 0) {
          await repo.predictions.replaceResults(fixture.competitionId, set.id, results);
        }
        await repo.predictions.upsertSet({ ...set, status: "scored" });
      }
    }

    await repo.audit.create({
      actorUserId: admin.id,
      action: "stats.fetch-and-publish",
      entityType: "fixture",
      competitionId: fixture.competitionId,
      entityId: fixtureId,
      after: {
        afFixtureId,
        score: `${homeGoals}-${awayGoals}`,
        mapped: statItems.length,
        unmapped: unmapped.length,
        unmappedNames: unmapped.slice(0, 10)
      }
    });

    return json({
      afFixtureId,
      score: { home: homeGoals, away: awayGoals },
      mapped: statItems.length,
      unmapped: unmapped.length,
      unmappedNames: unmapped,
      pointsPublished: true
    });
  } catch (error) {
    return handleApiError(error);
  }
}
