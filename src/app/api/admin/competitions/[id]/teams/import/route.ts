import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser } from "@/server/api/http";
import { parseCsv } from "@/server/import/csv";
import { platformRepository } from "@/server/repositories/platform";

const schema = z.object({
  csv: z.string().optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        shortName: z.string().min(1),
        countryCode: z.string().optional(),
        logoUrl: z.string().optional()
      })
    )
    .optional()
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const input = await parseJson(request, schema);
    const rows = input.items ?? parseCsv(input.csv ?? "");
    const repo = platformRepository();

    const teams = await repo.teams.upsertMany(
      rows.map((row) => ({
        competitionId: id,
        name: row.name,
        shortName: row.shortName,
        countryCode: row.countryCode,
        logoUrl: row.logoUrl
      }))
    );

    await repo.audit.create({
      actorUserId: admin.id,
      action: "teams.import",
      entityType: "team",
      competitionId: id,
      after: { count: teams.length }
    });

    return json({ teams, count: teams.length });
  } catch (error) {
    return handleApiError(error);
  }
}
