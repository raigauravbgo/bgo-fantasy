import { handleApiError, json, requireAdminUser } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  try {
    await requireAdminUser();
    const users = await prisma.user.findMany({
      where: { role: "player" },
      select: { id: true, name: true, email: true, employeeId: true, createdAt: true }
    });
    return json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    await requireAdminUser();
    const playerIds = await prisma.user.findMany({
      where: { role: "player" },
      select: { id: true }
    });
    const ids = playerIds.map((u) => u.id);
    if (ids.length === 0) return json({ deleted: 0 });

    await prisma.$transaction([
      prisma.bugReport.deleteMany({ where: { userId: { in: ids } } }),
      prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } }),
      prisma.entryPoints.deleteMany({ where: { userId: { in: ids } } }),
      prisma.fantasyEntry.deleteMany({ where: { userId: { in: ids } } }),
      prisma.userPrediction.deleteMany({ where: { userId: { in: ids } } }),
      prisma.predictionResult.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);

    return json({ deleted: ids.length });
  } catch (error) {
    return handleApiError(error);
  }
}
