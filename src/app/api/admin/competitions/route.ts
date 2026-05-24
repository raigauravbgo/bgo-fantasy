import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const schema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  registrationOpen: z.boolean().default(true),
  lockDeadline: z.coerce.date().nullable().optional(),
  budget: z.number().positive().default(100),
  maxPlayersPerTeam: z.number().int().positive().default(3)
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const input = await parseJson(request, schema);
    const repo = platformRepository();
    const competition = await repo.competitions.upsert({
      name: input.name,
      slug: input.slug,
      sportType: "soccer",
      status: "active",
      registrationOpen: input.registrationOpen,
      lockMode: "competition",
      lockDeadline: input.lockDeadline ?? null,
      settings: {
        budget: input.budget,
        maxPlayersPerTeam: input.maxPlayersPerTeam,
        predictionPointsMode: "overall"
      }
    });

    await repo.audit.create({
      actorUserId: admin.id,
      action: "competition.upsert",
      entityType: "competition",
      entityId: competition.id,
      competitionId: competition.id,
      after: competition
    });

    return json({ competition });
  } catch (error) {
    return handleApiError(error);
  }
}
