import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { calculateFixtureScoring } from "@/server/services/scoring";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id: competitionId } = await context.params;
    const repo = platformRepository();
    const competition = await repo.competitions.findById(competitionId);
    if (!competition) throw new RequestError("Competition not found", 404);

    const [fixtures, players, entries] = await Promise.all([
      repo.fixtures.list(competitionId),
      repo.players.list(competitionId),
      repo.entries.list(competitionId)
    ]);

    const scoredFixtures = fixtures.filter((f) => f.status === "completed");
    const results: { fixtureId: string; playerCount: number; entryCount: number }[] = [];

    for (const fixture of scoredFixtures) {
      const rawStats = await repo.rawStats.listByFixture(fixture.id);
      if (rawStats.length === 0) continue;

      const scoring = calculateFixtureScoring({
        competitionId,
        fixtureId: fixture.id,
        rawStats,
        players,
        entries,
        actorUserId: admin.id,
        status: "published"
      });

      await repo.points.replaceFixturePoints({
        competitionId,
        fixtureId: fixture.id,
        ...scoring
      });

      results.push({
        fixtureId: fixture.id,
        playerCount: scoring.playerPoints.length,
        entryCount: scoring.entryPoints.length
      });
    }

    await repo.audit.create({
      actorUserId: admin.id,
      action: "scoring.recalculate_competition",
      entityType: "competition",
      entityId: competitionId,
      competitionId,
      after: { fixturesRecalculated: results.length, results }
    });

    return json({ recalculated: results.length, results });
  } catch (error) {
    return handleApiError(error);
  }
}
