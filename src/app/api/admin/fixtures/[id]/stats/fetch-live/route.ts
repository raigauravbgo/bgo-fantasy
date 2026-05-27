import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { calculateFixtureScoring } from "@/server/services/scoring";
import { getEnv } from "@/config/env";
import type { SoccerRawStats } from "@/domain/adapters/soccer/stats-schema";

const AF_BASE = "https://v3.api-sports.io";

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
    home: { name: string };
    away: { name: string };
  };
  score: {
    fulltime: { home: number | null; away: number | null };
  };
};

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

    // Find the matching API-Football fixture by date + league
    const date = new Date(fixture.startTime).toISOString().slice(0, 10);
    const afFixtures = await afFetch<AfFixture[]>(
      `/fixtures?league=${leagueId}&date=${date}`,
      apiKey
    );

    // Match by team name similarity
    const t1 = (fixture.team1Name ?? "").toLowerCase();
    const t2 = (fixture.team2Name ?? "").toLowerCase();

    const matched = afFixtures.find((af) => {
      const home = af.teams.home.name.toLowerCase();
      const away = af.teams.away.name.toLowerCase();
      return (
        (home.includes(t1.split(" ")[0]) || t1.includes(home.split(" ")[0])) &&
        (away.includes(t2.split(" ")[0]) || t2.includes(away.split(" ")[0]))
      );
    });

    if (!matched) {
      const available = afFixtures.map((af) => `${af.teams.home.name} vs ${af.teams.away.name}`).join(", ");
      throw new RequestError(
        `Could not match fixture "${fixture.team1Name} vs ${fixture.team2Name}" on ${date}. Available: ${available || "none"}`,
        404
      );
    }

    const afFixtureId = matched.fixture.id;
    const ftScore = matched.score.fulltime;

    // Fetch player stats
    const playerStats = await afFetch<AfPlayer[]>(
      `/fixtures/players?fixture=${afFixtureId}`,
      apiKey
    );

    // Determine clean sheet — team kept a clean sheet if opponent scored 0
    const homeGoals = ftScore.home ?? 0;
    const awayGoals = ftScore.away ?? 0;

    const players = await repo.players.list(fixture.competitionId);
    const byName = new Map(players.map((p) => [p.name.toLowerCase(), p]));

    // Fuzzy name match — try full name, then last name, then first word
    function findPlayer(afName: string) {
      const lower = afName.toLowerCase();
      if (byName.has(lower)) return byName.get(lower);
      // try last name
      const parts = lower.split(" ");
      const lastName = parts[parts.length - 1];
      for (const [key, p] of byName) {
        if (key.includes(lastName) || lastName.includes(key.split(" ").pop() ?? "")) return p;
      }
      return undefined;
    }

    const statItems: Array<{ competitionId: string; fixtureId: string; playerId: string; source: "provider"; stats: SoccerRawStats }> = [];
    const unmapped: string[] = [];

    for (const afPlayer of playerStats) {
      const s = afPlayer.statistics[0];
      if (!s || (s.games.minutes ?? 0) === 0) continue; // skip DNP

      const player = findPlayer(afPlayer.player.name);
      if (!player) { unmapped.push(afPlayer.player.name); continue; }

      // Clean sheet: home players keep CS if awayGoals=0, away players if homeGoals=0
      // We don't know which team the player is on from our DB, so use minutes heuristic:
      // Use fixture team assignment via teamId
      const isHomeTeam = player.teamId === fixture.team1Id;
      const cleanSheet = isHomeTeam ? awayGoals === 0 : homeGoals === 0;

      statItems.push({
        competitionId: fixture.competitionId,
        fixtureId,
        playerId: player.id,
        source: "provider",
        stats: mapStats(afPlayer, cleanSheet)
      });
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

    await repo.fixtures.update(fixtureId, {
      status: "completed",
      score: { team1: homeGoals, team2: awayGoals },
      result: {
        winnerTeamId: homeGoals > awayGoals
          ? fixture.team1Id
          : awayGoals > homeGoals
            ? fixture.team2Id
            : "draw"
      }
    });

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
