import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const schema = z.object({
  active: z.boolean(),
  maxTransfers: z.number().int().min(0).default(3),
  closesAt: z.coerce.date().optional()
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

    const updated = await repo.competitions.upsert({
      ...competition,
      settings: {
        ...competition.settings,
        transferWindow: {
          active: input.active,
          maxTransfers: input.maxTransfers,
          openedAt: input.active ? new Date() : undefined,
          closesAt: input.closesAt
        }
      }
    });

    await repo.audit.create({
      actorUserId: admin.id,
      action: "transfer_window.update",
      entityType: "competition",
      entityId: id,
      competitionId: id,
      after: updated.settings.transferWindow
    });

    return json({ competition: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
