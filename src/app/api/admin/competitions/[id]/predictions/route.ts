import { handleApiError, json, requireAdminUser } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id: competitionId } = await context.params;
    const repo = platformRepository();

    const [sets, fixtures, allPredictions] = await Promise.all([
      repo.predictions.listSets(competitionId),
      repo.fixtures.list(competitionId),
      repo.predictions.listUserPredictions(competitionId),
    ]);

    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));

    const predictionSets = sets.map((set) => {
      const fixture = fixtureMap.get(set.fixtureId);
      const setPreds = allPredictions.filter((p) => p.predictionSetId === set.id);
      const totalResponses = new Set(setPreds.map((p) => p.userId)).size;

      return {
        ...set,
        fixtureName: fixture
          ? `${fixture.team1Name ?? ""} vs ${fixture.team2Name ?? ""}`
          : undefined,
        fixtureStartTime: fixture?.startTime,
        fixtureStatus: fixture?.status,
        totalParticipants: totalResponses,
      };
    });

    return json({ predictionSets });
  } catch (error) {
    return handleApiError(error);
  }
}
