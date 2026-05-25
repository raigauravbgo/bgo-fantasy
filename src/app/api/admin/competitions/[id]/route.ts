import { type NextRequest } from "next/server";
import { z } from "zod";

import {
  handleApiError,
  json,
  parseJson,
  requireAdminUser,
  RequestError
} from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const schema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  registrationOpen: z.boolean().optional(),
  lockDeadline: z.coerce.date().nullable().optional(),
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
  budget: z.number().positive().optional(),
  squadSize: z.number().int().positive().optional(),
  maxPlayersPerTeam: z.number().int().positive().optional()
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const input = await parseJson(request, schema);
    const repo = platformRepository();
    const competition = await repo.competitions.findById(id);
    if (!competition) throw new RequestError("Competition not found", 404);

    const updated = await repo.competitions.upsert({
      ...competition,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.registrationOpen !== undefined && { registrationOpen: input.registrationOpen }),
      ...(input.lockDeadline !== undefined && { lockDeadline: input.lockDeadline }),
      ...(input.status !== undefined && { status: input.status }),
      settings: {
        ...competition.settings,
        ...(input.budget !== undefined && { budget: input.budget }),
        ...(input.squadSize !== undefined && { squadSize: input.squadSize }),
        ...(input.maxPlayersPerTeam !== undefined && {
          maxPlayersPerTeam: input.maxPlayersPerTeam
        })
      }
    });

    await repo.audit.create({
      actorUserId: admin.id,
      action: "competition.update",
      entityType: "competition",
      entityId: id,
      competitionId: id,
      before: competition,
      after: updated
    });

    return json({ competition: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
