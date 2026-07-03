import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const schema = z.object({
  active: z.boolean(),
  maxTransfers: z.number().int().min(1).max(15).default(3),
  durationHours: z.number().int().min(1).max(168).optional(),
  resetUsage: z.boolean().default(false)
});

export async function POST(
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

    const closesAt = input.active && input.durationHours
      ? new Date(Date.now() + input.durationHours * 60 * 60 * 1000)
      : undefined;

    const updated = await repo.competitions.upsert({
      ...competition,
      settings: {
        ...competition.settings,
        transferWindow: {
          active: input.active,
          maxTransfers: input.maxTransfers,
          openedAt: input.active ? new Date() : undefined,
          closesAt
        }
      }
    });

    let resetCount = 0;
    if (input.active && input.resetUsage) {
      resetCount = await repo.entries.resetTransferUsage(id);
    }

    await repo.audit.create({
      actorUserId: admin.id,
      action: "transfer_window.update",
      entityType: "competition",
      entityId: id,
      competitionId: id,
      after: { ...updated.settings.transferWindow, resetCount }
    });

    return json({ competition: updated, resetCount });
  } catch (error) {
    return handleApiError(error);
  }
}
