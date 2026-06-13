import { handleApiError, json, requireUser, resolveCompetition } from "@/server/api/http";
import type { PredictionQuestion } from "@/server/services/predictions";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireUser();
    const { slug } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);

    const sets = await repo.predictions.listActive(competition.id);
    if (sets.length === 0) return json({ predictionSets: [] });

    const [fixtures, allPredictions] = await Promise.all([
      repo.fixtures.list(competition.id),
      repo.predictions.listUserPredictions(competition.id),
    ]);

    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));

    const predictionSets = sets.map((set) => {
      const fixture = fixtureMap.get(set.fixtureId);
      const setPreds = allPredictions.filter((p) => p.predictionSetId === set.id);

      const questions = (set.questions as unknown as PredictionQuestion[]).map((q) => {
        const qPreds = setPreds.filter((p) => p.questionId === q.id);
        const voteCounts: Record<string, number> = {};
        for (const opt of q.options) voteCounts[opt.value] = 0;
        for (const pred of qPreds) {
          voteCounts[pred.value] = (voteCounts[pred.value] ?? 0) + 1;
        }
        const myAnswer = qPreds.find((p) => p.userId === user.id)?.value ?? null;
        return { ...q, voteCounts, totalVotes: qPreds.length, myAnswer };
      });

      return {
        ...set,
        fixtureName: fixture
          ? `${fixture.team1Name ?? ""} vs ${fixture.team2Name ?? ""}`
          : undefined,
        fixtureStartTime: fixture?.startTime,
        questions,
      };
    });

    return json({ predictionSets });
  } catch (error) {
    return handleApiError(error);
  }
}
