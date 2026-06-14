import { type NextRequest } from "next/server";
import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; announcementId: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id: competitionId, announcementId } = await context.params;
    const repo = platformRepository();

    const announcement = await repo.announcements.findById(announcementId);
    if (!announcement) throw new RequestError("Announcement not found", 404);
    if (announcement.competitionId !== competitionId) throw new RequestError("Not found", 404);

    await repo.announcements.delete(announcementId);

    await repo.audit.create({
      actorUserId: admin.id,
      action: "announcements.delete",
      entityType: "announcement",
      entityId: announcementId,
      competitionId,
      before: announcement
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
