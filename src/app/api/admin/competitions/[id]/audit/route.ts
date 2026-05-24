import { handleApiError, json, requireAdminUser } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const repo = platformRepository();
    return json({ auditLogs: await repo.audit.list(id) });
  } catch (error) {
    return handleApiError(error);
  }
}
