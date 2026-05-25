import { handleApiError, json, requireAdminUser } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  try {
    await requireAdminUser();
    const reports = await prisma.bugReport.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, employeeId: true } } }
    });
    return json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
