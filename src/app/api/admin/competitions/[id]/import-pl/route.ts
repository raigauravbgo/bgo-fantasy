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

// Known star prices — everyone else gets position-based default
const STAR_PRICES: Record<string, number> = {
  // GKs
  "Alisson Becker": 6.5, "David Raya": 6.0, "Jordan Pickford": 5.5,
  "Nick Pope": 5.5, "Robert Sánchez": 5.0, "Ederson": 6.0,
  // DEFs
  "Trent Alexander-Arnold": 8.5, "Virgil van Dijk": 7.5, "Andrew Robertson": 7.0,
  "Ibrahima Konaté": 6.5, "Ben White": 7.0, "William Saliba": 7.5,
  "Oleksandr Zinchenko": 6.5, "Ben Chilwell": 6.0, "Reece James": 6.5,
  "Ruben Dias": 7.0, "Kyle Walker": 6.5, "João Cancelo": 6.5,
  "Pedro Porro": 6.0, "Destiny Udogie": 6.0, "Cristian Romero": 7.0,
  "Micky van de Ven": 6.5, "Kieran Trippier": 7.0, "Sven Botman": 6.0,
  "Dan Burn": 5.5, "Fabian Schär": 6.0,
  // MIDs
  "Mohamed Salah": 13.0, "Phil Foden": 10.5, "Kevin De Bruyne": 10.0,
  "Bukayo Saka": 11.5, "Martin Ødegaard": 9.5, "Bernardo Silva": 9.0,
  "Bruno Fernandes": 9.0, "Marcus Rashford": 8.5, "Mason Mount": 7.5,
  "Declan Rice": 9.0, "Rodri": 9.5, "Alexis Mac Allister": 8.5,
  "Dominik Szoboszlai": 8.5, "Harvey Elliott": 7.0, "Conor Gallagher": 7.0,
  "James Maddison": 8.5, "Dejan Kulusevski": 8.0, "Son Heung-min": 10.0,
  "Jarrod Bowen": 8.5, "Lucas Paquetá": 8.0, "Mohammed Kudus": 7.5,
  "Eberechi Eze": 8.0, "Michael Olise": 9.0, "Adam Wharton": 6.0,
  // FWDs
  "Erling Haaland": 14.5, "Harry Kane": 13.0, "Ollie Watkins": 10.5,
  "Cole Palmer": 11.5, "Nicolas Jackson": 9.0, "Alexander Isak": 10.5,
  "Dominic Solanke": 7.5, "Richarlison": 8.0, "Callum Wilson": 7.5,
  "Darwin Núñez": 9.5, "Roberto Firmino": 7.0, "Chris Wood": 7.0,
  "Taiwo Awoniyi": 7.0, "Emmanuel Dennis": 6.5, "Ivan Toney": 9.0,
};

// Pre-computed lowercase token lookup for fuzzy matching
const STAR_PRICE_TOKENS: Array<{ tokens: string[]; price: number }> = Object.entries(STAR_PRICES).map(
  ([k, v]) => ({ tokens: k.toLowerCase().split(/\s+/), price: v })
);

function playerPrice(name: string, pos: "GK" | "DEF" | "MID" | "FWD"): number {
  const lower = name.toLowerCase();
  // Exact match first
  if (STAR_PRICES[name]) return STAR_PRICES[name];
  // Fuzzy: all tokens of the known name must appear somewhere in the player name
  for (const { tokens, price } of STAR_PRICE_TOKENS) {
    if (tokens.every((t) => lower.includes(t))) return price;
  }
  return { GK: 5.0, DEF: 5.5, MID: 6.0, FWD: 7.0 }[pos];
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
          price: playerPrice(p.name, pos),
          status: "available" as const
        };
      });
    });

    const savedPlayers = await repo.players.upsertMany(playerItems);

    // 3. Fetch fixtures — try scheduled first, fall back to last 38 finished matches
    let rawMatches: FdMatch[] = [];
    const scheduled = await fdFetch<{ matches: FdMatch[] }>(
      "/competitions/PL/matches?status=SCHEDULED&limit=30",
      apiKey
    );
    rawMatches = scheduled.matches;

    if (rawMatches.length === 0) {
      // Off-season: use last season's finished matches for testing
      const finished = await fdFetch<{ matches: FdMatch[] }>(
        "/competitions/PL/matches?status=FINISHED&limit=38&season=2024",
        apiKey
      );
      rawMatches = finished.matches;
    }

    const fixtureItems = rawMatches.map((m) => {
      const team1 = teamByTla.get(m.homeTeam.tla);
      const team2 = teamByTla.get(m.awayTeam.tla);
      const isFinished = m.status === "FINISHED";
      return {
        competitionId,
        team1Id: team1?.id ?? savedTeams[0].id,
        team2Id: team2?.id ?? savedTeams[1].id,
        team1Name: m.homeTeam.name,
        team2Name: m.awayTeam.name,
        status: isFinished ? ("completed" as const) : ("upcoming" as const),
        startTime: new Date(m.utcDate),
        venue: m.venue ?? undefined
      };
    }).filter((f) => f.team1Id !== f.team2Id);

    const savedFixtures = await repo.fixtures.upsertMany(fixtureItems);

    await repo.audit.create({
      actorUserId: null,
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
  status: string;
  venue: string | null;
  homeTeam: { tla: string; name: string };
  awayTeam: { tla: string; name: string };
};
