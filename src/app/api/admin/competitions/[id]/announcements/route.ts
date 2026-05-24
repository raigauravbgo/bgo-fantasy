import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const schema = z.object({
  title: z.string().optional(),
  message: z.string().min(1),
  icon: z.string().optional(),
  priority: z.enum(["normal", "high"]).default("normal"),
  expiresAt: z.coerce.date().optional()
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
    const announcement = await repo.announcements.create({
      competitionId: id,
      ...input
    });

    await repo.audit.create({
      actorUserId: admin.id,
      action: "announcements.create",
      entityType: "announcement",
      entityId: announcement.id,
      competitionId: id,
      after: announcement
    });

    return json({ announcement });
  } catch (error) {
    return handleApiError(error);
  }
}
