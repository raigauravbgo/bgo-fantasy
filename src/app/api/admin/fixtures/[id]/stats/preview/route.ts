import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { calculateFixtureScoring } from "@/server/services/scoring";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id: fixtureId } = await context.params;
    const repo = platformRepository();
    const fixture = await repo.fixtures.findById(fixtureId);
    if (!fixture) throw new RequestError("Fixture not found", 404);

    const [rawStats, players, entries] = await Promise.all([
      repo.rawStats.listByFixture(fixtureId),
      repo.players.list(fixture.competitionId),
      repo.entries.list(fixture.competitionId)
    ]);

    return json(
      calculateFixtureScoring({
        competitionId: fixture.competitionId,
        fixtureId,
        rawStats,
        players,
        entries,
        actorUserId: admin.id,
        status: "preview"
      })
    );
  } catch (error) {
    return handleApiError(error);
  }
}
