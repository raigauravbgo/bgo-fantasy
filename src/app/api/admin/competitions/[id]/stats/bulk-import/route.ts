import { type NextRequest } from "next/server";
import { z } from "zod";

import type { SoccerRawStats } from "@/domain/adapters/soccer/stats-schema";
import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { parseCsv } from "@/server/import/csv";
import { platformRepository } from "@/server/repositories/platform";

const rowSchema = z.object({
  matchDate: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeScore: z.coerce.number().int().min(0).optional(),
  awayScore: z.coerce.number().int().min(0).optional(),
  playerName: z.string(),
  team: z.string().optional(),
  position: z.string().optional(),
  minutesPlayed: z.coerce.number().optional(),
  started: z.coerce.boolean().optional(),
  goals: z.coerce.number().optional(),
  assists: z.coerce.number().optional(),
  yellowCards: z.coerce.number().optional(),
  redCards: z.coerce.number().optional(),
  saves: z.coerce.number().optional(),
  cleanSheet: z.coerce.boolean().optional(),
  goalsConceded: z.coerce.number().optional(),
  penaltySaves: z.coerce.number().optional()
});

function firstWord(s: string) {
  return s.trim().toLowerCase().split(/\s+/)[0];
}

function fixtureMatchesTeams(
  fixHome: string,
  fixAway: string,
  csvHome: string,
  csvAway: string
): boolean {
  const fh = fixHome.toLowerCase();
  const fa = fixAway.toLowerCase();
  const ch = csvHome.toLowerCase();
  const ca = csvAway.toLowerCase();
  return (
    (fh.includes(firstWord(ch)) || ch.includes(firstWord(fh))) &&
    (fa.includes(firstWord(ca)) || ca.includes(firstWord(fa)))
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id: competitionId } = await context.params;

    const contentType = request.headers.get("content-type") ?? "";
    let csvText: string;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new RequestError("No file uploaded", 400);
      csvText = await (file as File).text();
    } else {
      csvText = await request.text();
    }

    if (!csvText.trim()) throw new RequestError("Empty CSV", 400);

    const rawRows = parseCsv(csvText);
    const rows = rawRows.map((r, i) => {
      const parsed = rowSchema.safeParse(r);
      if (!parsed.success) throw new RequestError(`Row ${i + 2}: ${parsed.error.issues[0]?.message}`, 422);
      return parsed.data;
    });

    const repo = platformRepository();
    const [allFixtures, allPlayers] = await Promise.all([
      repo.fixtures.list(competitionId),
      repo.players.list(competitionId)
    ]);

    const playerByName = new Map(allPlayers.map((p) => [p.name.toLowerCase(), p]));

    function findPlayer(name: string) {
      const lower = name.toLowerCase();
      if (playerByName.has(lower)) return playerByName.get(lower);
      const parts = lower.split(" ");
      const last = parts[parts.length - 1];
      for (const [key, p] of playerByName) {
        const keyLast = key.split(" ").pop() ?? "";
        if (key.includes(last) || last.includes(keyLast)) return p;
      }
      return undefined;
    }

    // Group rows by fixture key (matchDate + homeTeam + awayTeam)
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.matchDate}|${row.homeTeam}|${row.awayTeam}`;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }

    const results: Array<{
      fixture: string;
      mapped: number;
      unmapped: string[];
      score?: { home: number; away: number };
      noFixtureMatch: boolean;
    }> = [];

    const allStatItems: Array<{
      competitionId: string;
      fixtureId: string;
      playerId: string;
      source: "manual";
      stats: SoccerRawStats;
    }> = [];

    const fixtureScoreUpdates: Array<{
      fixtureId: string;
      team1: number;
      team2: number;
      team1Id: string;
      team2Id: string;
    }> = [];

    for (const [key, groupRows] of groups) {
      const [matchDate, homeTeam, awayTeam] = key.split("|");
      const csvDateMs = new Date(matchDate).getTime();

      // Match fixture: team names + date within ±1 day (handles UTC offset)
      const fixture = allFixtures.find((f) => {
        const fDateMs = new Date(f.startTime).getTime();
        const dayDiff = Math.abs(fDateMs - csvDateMs) / 86_400_000;
        return (
          dayDiff <= 1.5 &&
          fixtureMatchesTeams(f.team1Name ?? "", f.team2Name ?? "", homeTeam, awayTeam)
        );
      });

      if (!fixture) {
        results.push({ fixture: `${homeTeam} vs ${awayTeam} (${matchDate})`, mapped: 0, unmapped: [], noFixtureMatch: true });
        continue;
      }

      const unmapped: string[] = [];
      const statItems: typeof allStatItems = [];

      for (const row of groupRows) {
        const player = findPlayer(row.playerName);
        if (!player) { unmapped.push(row.playerName); continue; }

        const { matchDate: _d, homeTeam: _h, awayTeam: _a, homeScore: _hs, awayScore: _as, playerName: _pn, team: _t, position: _pos, ...statValues } = row;
        void _d; void _h; void _a; void _hs; void _as; void _pn; void _t; void _pos;

        statItems.push({
          competitionId,
          fixtureId: fixture.id,
          playerId: player.id,
          source: "manual",
          stats: statValues as SoccerRawStats
        });
      }

      allStatItems.push(...statItems);

      const firstRow = groupRows[0];
      const hasScore = firstRow.homeScore !== undefined && firstRow.awayScore !== undefined;
      if (hasScore) {
        fixtureScoreUpdates.push({
          fixtureId: fixture.id,
          team1: firstRow.homeScore!,
          team2: firstRow.awayScore!,
          team1Id: fixture.team1Id,
          team2Id: fixture.team2Id
        });
      }

      results.push({
        fixture: `${fixture.team1Name} vs ${fixture.team2Name}`,
        mapped: statItems.length,
        unmapped,
        score: hasScore ? { home: firstRow.homeScore!, away: firstRow.awayScore! } : undefined,
        noFixtureMatch: false
      });
    }

    if (allStatItems.length === 0) {
      throw new RequestError("No stats could be mapped — check that players are imported and fixture dates/team names match.", 422);
    }

    await repo.rawStats.upsertMany(allStatItems);

    // Update fixture scores and mark completed for fixtures that have scores
    await Promise.all(
      fixtureScoreUpdates.map(({ fixtureId, team1, team2, team1Id, team2Id }) =>
        repo.fixtures.update(fixtureId, {
          status: "completed",
          score: { team1, team2 },
          result: {
            winnerTeamId:
              team1 > team2 ? team1Id : team2 > team1 ? team2Id : "draw"
          }
        })
      )
    );

    await repo.audit.create({
      actorUserId: admin.id,
      action: "stats.bulk-import",
      entityType: "fixture",
      competitionId,
      entityId: competitionId,
      after: {
        totalStats: allStatItems.length,
        fixtures: results.length,
        fixturesMatched: results.filter((r) => !r.noFixtureMatch).length
      }
    });

    return json({ results, totalStats: allStatItems.length });
  } catch (error) {
    return handleApiError(error);
  }
}
