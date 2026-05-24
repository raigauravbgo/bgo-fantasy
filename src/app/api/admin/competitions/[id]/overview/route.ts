import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { usersRepository } from "@/server/repositories/users";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const repo = platformRepository();
    const competition = await repo.competitions.findById(id);
    if (!competition) throw new RequestError("Competition not found", 404);

    const [
      teams,
      players,
      fixtures,
      entries,
      entryPoints,
      playerPoints,
      predictionSets,
      predictionResults,
      announcements,
      auditLogs,
      users
    ] = await Promise.all([
      repo.teams.list(id),
      repo.players.list(id),
      repo.fixtures.list(id),
      repo.entries.list(id),
      repo.points.listEntryPoints(id),
      repo.points.listPlayerPoints(id),
      repo.predictions.listSets(id),
      repo.predictions.listResults(id),
      repo.announcements.listActive(id),
      repo.audit.list(id),
      usersRepository().list()
    ]);

    return json({
      competition,
      teams,
      players,
      fixtures,
      entries,
      entryPoints,
      playerPoints,
      predictionSets,
      predictionResults,
      announcements,
      auditLogs,
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}
