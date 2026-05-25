import { type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";

const schema = z.object({
  status: z.enum(["open", "in-progress", "resolved", "wont-fix"])
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const { status } = await parseJson(request, schema);

    const report = await prisma.bugReport.findUnique({ where: { id } });
    if (!report) throw new RequestError("Report not found", 404);

    const updated = await prisma.bugReport.update({ where: { id }, data: { status } });
    return json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleApiError(error);
  }
}
