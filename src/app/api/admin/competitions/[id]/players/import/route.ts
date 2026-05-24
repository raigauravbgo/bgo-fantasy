import { type NextRequest } from "next/server";
import { z } from "zod";

import type { Player } from "@/domain/models";
import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { parseCsv } from "@/server/import/csv";
import { platformRepository } from "@/server/repositories/platform";

const itemSchema = z.object({
  name: z.string().min(1),
  teamShortName: z.string().min(1),
  position: z.enum(["GK", "DEF", "MID", "FWD"]),
  price: z.coerce.number().positive(),
  status: z
    .enum(["available", "doubtful", "injured", "suspended", "unavailable"])
    .default("available")
});

const schema = z.object({
  csv: z.string().optional(),
  items: z.array(itemSchema).optional()
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const input = await parseJson(request, schema);
    const parsedRows = input.items ?? parseCsv(input.csv ?? "").map((row) => itemSchema.parse(row));
    const repo = platformRepository();
    const teams = await repo.teams.list(id);
    const teamsByShortName = new Map(teams.map((team) => [team.shortName, team]));
    const unmapped = parsedRows
      .filter((row) => !teamsByShortName.has(row.teamShortName))
      .map((row) => row.teamShortName);

    if (unmapped.length) {
      throw new RequestError("Unmapped teams in player import", 422, unmapped);
    }

    const players = await repo.players.upsertMany(
      parsedRows.map((row): Omit<Player, "id"> => {
        const team = teamsByShortName.get(row.teamShortName)!;
        return {
          competitionId: id,
          name: row.name,
          teamId: team.id,
          teamName: team.name,
          teamShortName: team.shortName,
          position: row.position,
          price: row.price,
          status: row.status
        };
      })
    );

    await repo.audit.create({
      actorUserId: admin.id,
      action: "players.import",
      entityType: "player",
      competitionId: id,
      after: { count: players.length }
    });

    return json({ players, count: players.length });
  } catch (error) {
    return handleApiError(error);
  }
}
