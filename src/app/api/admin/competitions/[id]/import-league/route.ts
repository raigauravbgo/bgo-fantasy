import { type NextRequest } from "next/server";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const FD_BASE = "https://api.football-data.org/v4";

export const SUPPORTED_LEAGUES: Record<string, { name: string; countryCode: string; season: number }> = {
  PL:  { name: "Premier League",      countryCode: "GB", season: 2024 },
  BL1: { name: "Bundesliga",          countryCode: "DE", season: 2024 },
  PD:  { name: "La Liga",             countryCode: "ES", season: 2024 },
  SA:  { name: "Serie A",             countryCode: "IT", season: 2024 },
  FL1: { name: "Ligue 1",             countryCode: "FR", season: 2024 },
  DED: { name: "Eredivisie",          countryCode: "NL", season: 2024 },
  PPL: { name: "Primeira Liga",       countryCode: "PT", season: 2024 },
  ELC: { name: "Championship",        countryCode: "GB", season: 2024 },
  BSA: { name: "Brasileirão",         countryCode: "BR", season: 2025 },
};

const schema = z.object({
  leagueCode: z.string().min(2).max(5).default("PL")
});

function mapPosition(pos: string | null | undefined): "GK" | "DEF" | "MID" | "FWD" {
  if (!pos) return "MID";
  const p = pos.toLowerCase();
  if (p.includes("goalkeeper") || p === "gk") return "GK";
  if (p.includes("back") || p.includes("defence") || p.includes("defender")) return "DEF";
  if (p.includes("forward") || p.includes("winger") || p.includes("attacker") || p.includes("centre-forward") || p.includes("offence")) return "FWD";
  return "MID";
}

// Known star prices across top leagues
const STAR_PRICES: Record<string, number> = {
  // PL GKs
  "Alisson Becker": 6.5, "David Raya": 6.0, "Jordan Pickford": 5.5, "Ederson": 6.0,
  // PL DEFs
  "Trent Alexander-Arnold": 8.5, "Virgil van Dijk": 7.5, "Andrew Robertson": 7.0,
  "William Saliba": 7.5, "Ben White": 7.0, "Ibrahima Konaté": 6.5,
  "Ruben Dias": 7.0, "Kyle Walker": 6.5, "Kieran Trippier": 7.0,
  "Cristian Romero": 7.0, "Micky van de Ven": 6.5,
  // PL MIDs
  "Mohamed Salah": 13.0, "Phil Foden": 10.5, "Kevin De Bruyne": 10.0,
  "Bukayo Saka": 11.5, "Martin Ødegaard": 9.5, "Bernardo Silva": 9.0,
  "Bruno Fernandes": 9.0, "Declan Rice": 9.0, "Rodri": 9.5,
  "Alexis Mac Allister": 8.5, "Dominik Szoboszlai": 8.5, "Son Heung-min": 10.0,
  "Jarrod Bowen": 8.5, "Eberechi Eze": 8.0, "Michael Olise": 9.0,
  // PL FWDs
  "Erling Haaland": 14.5, "Harry Kane": 13.0, "Ollie Watkins": 10.5,
  "Cole Palmer": 11.5, "Alexander Isak": 10.5, "Darwin Núñez": 9.5,
  "Nicolas Jackson": 9.0, "Ivan Toney": 9.0,
  // Bundesliga stars
  "Florian Wirtz": 11.0, "Jamal Musiala": 11.5, "Leroy Sané": 9.5,
  "Serge Gnabry": 8.0, "Thomas Müller": 8.0, "Joshua Kimmich": 9.0,
  "Robert Andrich": 7.5, "Granit Xhaka": 7.5,
  "Viktor Boniface": 9.5, "Patrik Schick": 8.5,
  // La Liga stars
  "Vinícius Júnior": 13.5, "Jude Bellingham": 12.5, "Kylian Mbappé": 14.0,
  "Pedri": 10.0, "Gavi": 9.5, "Lamine Yamal": 11.0,
  "Raphinha": 10.5, "Robert Lewandowski": 12.0, "Antoine Griezmann": 10.0,
  "Álvaro Morata": 9.0, "Paulo Dybala": 9.5, "Dani Carvajal": 7.5,
  // Serie A stars
  "Lautaro Martínez": 12.5, "Dusan Vlahovic": 11.0, "Victor Osimhen": 13.0,
  "Khvicha Kvaratskhelia": 11.5, "Rafael Leão": 11.0, "Theo Hernández": 8.0,
  "Federico Chiesa": 9.5, "Nicolo Barella": 9.5, "Ademola Lookman": 9.0,
  // Ligue 1 stars
  "Bradley Barcola": 9.5, "Ousmane Dembélé": 10.5, "Mason Greenwood": 9.0,
  "Elye Wahi": 8.5, "Jonathan David": 11.0,
};

const STAR_PRICE_TOKENS = Object.entries(STAR_PRICES).map(
  ([k, v]) => ({ tokens: k.toLowerCase().split(/\s+/), price: v })
);

function playerPrice(name: string, pos: "GK" | "DEF" | "MID" | "FWD"): number {
  if (STAR_PRICES[name]) return STAR_PRICES[name];
  const lower = name.toLowerCase();
  for (const { tokens, price } of STAR_PRICE_TOKENS) {
    if (tokens.every((t) => lower.includes(t))) return price;
  }
  return { GK: 5.0, DEF: 5.5, MID: 6.0, FWD: 7.0 }[pos];
}

async function fdFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${FD_BASE}${path}`, { headers: { "X-Auth-Token": apiKey } });
  if (!res.ok) throw new RequestError(`football-data.org: ${res.status} ${await res.text()}`, 502);
  return res.json() as Promise<T>;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id: competitionId } = await context.params;
    const apiKey = getEnv().FOOTBALL_DATA_API_KEY;
    if (!apiKey) throw new RequestError("FOOTBALL_DATA_API_KEY env var not set", 500);

    const { leagueCode } = await parseJson(request, schema);
    const league = SUPPORTED_LEAGUES[leagueCode];
    if (!league) throw new RequestError(`Unsupported league code: ${leagueCode}`, 400);

    const repo = platformRepository();
    const competition = await repo.competitions.findById(competitionId);
    if (!competition) throw new RequestError("Competition not found", 404);

    // 1. Fetch teams + squads
    const teamsData = await fdFetch<{ teams: FdTeam[] }>(
      `/competitions/${leagueCode}/teams?season=${league.season}`,
      apiKey
    );

    const teamItems = teamsData.teams.map((t) => ({
      competitionId,
      name: t.name,
      shortName: t.tla,
      countryCode: league.countryCode
    }));
    const savedTeams = await repo.teams.upsertMany(teamItems);
    const teamByTla = new Map(savedTeams.map((t) => [t.shortName, t]));

    // 2. Build player list
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

    // 3. Fetch fixtures — scheduled first, fall back to finished
    let rawMatches: FdMatch[] = [];
    const scheduled = await fdFetch<{ matches: FdMatch[] }>(
      `/competitions/${leagueCode}/matches?status=SCHEDULED&limit=38`,
      apiKey
    );
    rawMatches = scheduled.matches;

    if (rawMatches.length === 0) {
      const finished = await fdFetch<{ matches: FdMatch[] }>(
        `/competitions/${leagueCode}/matches?status=FINISHED&limit=38&season=${league.season}`,
        apiKey
      );
      rawMatches = finished.matches;
    }

    const fixtureItems = rawMatches.map((m) => {
      const team1 = teamByTla.get(m.homeTeam.tla);
      const team2 = teamByTla.get(m.awayTeam.tla);
      return {
        competitionId,
        team1Id: team1?.id ?? savedTeams[0].id,
        team2Id: team2?.id ?? savedTeams[1].id,
        team1Name: m.homeTeam.name,
        team2Name: m.awayTeam.name,
        status: m.status === "FINISHED" ? ("completed" as const) : ("upcoming" as const),
        startTime: new Date(m.utcDate),
        venue: m.venue ?? undefined
      };
    }).filter((f) => f.team1Id !== f.team2Id);

    const savedFixtures = await repo.fixtures.upsertMany(fixtureItems);

    // 4. Save league code in competition settings
    await repo.competitions.upsert({
      ...competition,
      settings: { ...competition.settings, leagueCode }
    });

    await repo.audit.create({
      actorUserId: null,
      action: `import.${leagueCode.toLowerCase()}`,
      entityType: "competition",
      entityId: competitionId,
      after: { leagueCode, teams: savedTeams.length, players: savedPlayers.length, fixtures: savedFixtures.length }
    });

    return json({
      leagueCode,
      leagueName: league.name,
      imported: { teams: savedTeams.length, players: savedPlayers.length, fixtures: savedFixtures.length }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

type FdTeam = {
  id: number; name: string; tla: string;
  squad: Array<{ id: number; name: string; position: string | null }> | null;
};
type FdMatch = {
  utcDate: string; status: string; venue: string | null;
  homeTeam: { tla: string; name: string };
  awayTeam: { tla: string; name: string };
};
