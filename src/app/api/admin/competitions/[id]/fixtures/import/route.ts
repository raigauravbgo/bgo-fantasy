import { type NextRequest } from "next/server";
import { z } from "zod";

import type { Fixture } from "@/domain/models";
import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { parseCsv } from "@/server/import/csv";
import { platformRepository } from "@/server/repositories/platform";

const itemSchema = z.object({
  team1ShortName: z.string().min(1),
  team2ShortName: z.string().min(1),
  startTime: z.coerce.date(),
  venue: z.string().optional(),
  status: z
    .enum(["upcoming", "live", "completed", "postponed", "cancelled"])
    .default("upcoming")
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
    const rows = input.items ?? parseCsv(input.csv ?? "").map((row) => itemSchema.parse(row));
    const repo = platformRepository();
    const teams = await repo.teams.list(id);
    const teamsByShortName = new Map(teams.map((team) => [team.shortName, team]));
    const unmapped = rows
      .flatMap((row) => [row.team1ShortName, row.team2ShortName])
      .filter((shortName) => !teamsByShortName.has(shortName));

    if (unmapped.length) {
      throw new RequestError("Unmapped teams in fixture import", 422, unmapped);
    }

    const fixtures = await repo.fixtures.upsertMany(
      rows.map((row): Omit<Fixture, "id"> => {
        const team1 = teamsByShortName.get(row.team1ShortName)!;
        const team2 = teamsByShortName.get(row.team2ShortName)!;
        return {
          competitionId: id,
          team1Id: team1.id,
          team2Id: team2.id,
          team1Name: team1.name,
          team2Name: team2.name,
          startTime: row.startTime,
          venue: row.venue,
          status: row.status
        };
      })
    );

    await repo.audit.create({
      actorUserId: admin.id,
      action: "fixtures.import",
      entityType: "fixture",
      competitionId: id,
      after: { count: fixtures.length }
    });

    return json({ fixtures, count: fixtures.length });
  } catch (error) {
    return handleApiError(error);
  }
}
