import { getEnv } from "@/config/env";
import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const FD_BASE = "https://api.football-data.org/v4";

// Position mapping from football-data.org to our model
function mapPosition(pos: string | null | undefined): "GK" | "DEF" | "MID" | "FWD" {
  if (!pos) return "MID";
  const p = pos.toLowerCase();
  if (p.includes("goalkeeper") || p === "gk") return "GK";
  if (p.includes("back") || p.includes("defence") || p.includes("defender")) return "DEF";
  if (p.includes("forward") || p.includes("winger") || p.includes("attacker") || p.includes("centre-forward") || p.includes("offence")) return "FWD";
  return "MID";
}

// Rough price by position — admins can tweak later
function basePrice(pos: "GK" | "DEF" | "MID" | "FWD"): number {
  return { GK: 5.5, DEF: 5.5, MID: 6.5, FWD: 7.5 }[pos];
}

async function fdFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { "X-Auth-Token": apiKey }
  });
  if (!res.ok) throw new RequestError(`football-data.org error: ${res.status} ${await res.text()}`, 502);
  return res.json() as Promise<T>;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id: competitionId } = await context.params;
    const apiKey = getEnv().FOOTBALL_DATA_API_KEY;
    if (!apiKey) throw new RequestError("FOOTBALL_DATA_API_KEY env var not set", 500);

    const repo = platformRepository();
    const competition = await repo.competitions.findById(competitionId);
    if (!competition) throw new RequestError("Competition not found", 404);

    // 1. Fetch PL teams + squads
    const teamsData = await fdFetch<{ teams: FdTeam[] }>("/competitions/PL/teams?season=2024", apiKey);

    const teamItems = teamsData.teams.map((t) => ({
      competitionId,
      name: t.name,
      shortName: t.tla,
      countryCode: "GB"
    }));
    const savedTeams = await repo.teams.upsertMany(teamItems);
    const teamByTla = new Map(savedTeams.map((t) => [t.shortName, t]));

    // 2. Build player list from squads
    const playerItems = teamsData.teams.flatMap((fdTeam) => {
      const team = teamByTla.get(fdTeam.tla);
      if (!team) return [];
      return (fdTeam.squad ?? []).map((p) => {
        const pos = mapPosition(p.position);
        return {
          competitionId,
          teamId: team.id,
          teamName: team.name,
          teamShortName: team.shortName,
          name: p.name,
          position: pos,
          price: basePrice(pos),
          status: "available" as const
        };
      });
    });

    const savedPlayers = await repo.players.upsertMany(playerItems);

    // 3. Fetch upcoming fixtures (next 30)
    const matchesData = await fdFetch<{ matches: FdMatch[] }>(
      "/competitions/PL/matches?status=SCHEDULED&limit=30",
      apiKey
    );

    const fixtureItems = matchesData.matches.map((m) => {
      const team1 = teamByTla.get(m.homeTeam.tla);
      const team2 = teamByTla.get(m.awayTeam.tla);
      return {
        competitionId,
        team1Id: team1?.id ?? savedTeams[0].id,
        team2Id: team2?.id ?? savedTeams[1].id,
        team1Name: m.homeTeam.name,
        team2Name: m.awayTeam.name,
        status: "upcoming" as const,
        startTime: new Date(m.utcDate),
        venue: m.venue ?? undefined
      };
    }).filter((f) => f.team1Id !== f.team2Id);

    const savedFixtures = await repo.fixtures.upsertMany(fixtureItems);

    await repo.audit.create({
      actorUserId: "system",
      action: "import.premier-league",
      entityType: "competition",
      entityId: competitionId,
      after: { teams: savedTeams.length, players: savedPlayers.length, fixtures: savedFixtures.length }
    });

    return json({
      imported: {
        teams: savedTeams.length,
        players: savedPlayers.length,
        fixtures: savedFixtures.length
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// football-data.org types
type FdTeam = {
  id: number;
  name: string;
  tla: string;
  squad: Array<{ id: number; name: string; position: string | null }> | null;
};

type FdMatch = {
  utcDate: string;
  venue: string | null;
  homeTeam: { tla: string; name: string };
  awayTeam: { tla: string; name: string };
};
