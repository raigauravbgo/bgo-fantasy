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
  price: z.number().positive().optional(),
  position: z.enum(["GK", "DEF", "MID", "FWD"]).optional(),
  status: z
    .enum(["available", "doubtful", "injured", "suspended", "unavailable"])
    .optional()
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const input = await parseJson(request, schema);
    const repo = platformRepository();

    const player = (await repo.players.findMany([id]))[0];
    if (!player) throw new RequestError("Player not found", 404);

    const patch: Record<string, unknown> = {};
    if (input.price !== undefined) patch.price = input.price;
    if (input.position !== undefined) patch.position = input.position;
    if (input.status !== undefined) patch.status = input.status;

    await repo.players.update(id, patch);

    await repo.audit.create({
      actorUserId: admin.id,
      action: "player.update",
      entityType: "player",
      entityId: id,
      competitionId: player.competitionId,
      before: { price: player.price, position: player.position, status: player.status },
      after: patch
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
