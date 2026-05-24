import { type NextRequest } from "next/server";
import { z } from "zod";

import type { SoccerRawStats } from "@/domain/adapters/soccer/stats-schema";
import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { parseCsv } from "@/server/import/csv";
import { platformRepository } from "@/server/repositories/platform";

const statSchema = z.object({
  playerName: z.string().optional(),
  playerId: z.string().optional(),
  started: z.coerce.boolean().optional(),
  substituteAppearance: z.coerce.boolean().optional(),
  minutesPlayed: z.coerce.number().optional(),
  goals: z.coerce.number().optional(),
  assists: z.coerce.number().optional(),
  cleanSheet: z.coerce.boolean().optional(),
  goalsConceded: z.coerce.number().optional(),
  saves: z.coerce.number().optional(),
  penaltySaves: z.coerce.number().optional(),
  yellowCards: z.coerce.number().optional(),
  redCards: z.coerce.number().optional(),
  penaltyMisses: z.coerce.number().optional(),
  ownGoals: z.coerce.number().optional(),
  playerOfTheMatch: z.coerce.boolean().optional()
});

const schema = z.object({
  csv: z.string().optional(),
  items: z.array(statSchema).optional()
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id: fixtureId } = await context.params;
    const input = await parseJson(request, schema);
    const rows = input.items ?? parseCsv(input.csv ?? "").map((row) => statSchema.parse(row));
    const repo = platformRepository();
    const fixture = await repo.fixtures.findById(fixtureId);
    if (!fixture) throw new RequestError("Fixture not found", 404);

    const players = await repo.players.list(fixture.competitionId);
    const byName = new Map(players.map((player) => [player.name.toLowerCase(), player]));
    const byId = new Map(players.map((player) => [player.id, player]));
    const unmapped: string[] = [];

    const stats = rows.flatMap((row) => {
      const player = row.playerId
        ? byId.get(row.playerId)
        : row.playerName
          ? byName.get(row.playerName.toLowerCase())
          : undefined;

      if (!player) {
        unmapped.push(row.playerName ?? row.playerId ?? "unknown");
        return [];
      }

      const { playerId, playerName, ...statValues } = row;
      void playerId;
      void playerName;
      return [
        {
          competitionId: fixture.competitionId,
          fixtureId,
          playerId: player.id,
          source: "manual" as const,
          stats: statValues as SoccerRawStats
        }
      ];
    });

    if (unmapped.length) {
      throw new RequestError("Unmapped players in stats import", 422, unmapped);
    }

    const saved = await repo.rawStats.upsertMany(stats);
    await repo.audit.create({
      actorUserId: admin.id,
      action: "stats.import",
      entityType: "raw_stat",
      competitionId: fixture.competitionId,
      entityId: fixtureId,
      after: { count: saved.length }
    });

    return json({ stats: saved, count: saved.length });
  } catch (error) {
    return handleApiError(error);
  }
}
