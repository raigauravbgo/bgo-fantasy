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

    const allSets = await repo.predictions.listSets(competition.id);
    const bumperSets = allSets.filter((s) => s.type === "bumper" || !s.fixtureId);

    if (bumperSets.length === 0) return json({ bumperSets: [] });

    const [allPredictions, allResults] = await Promise.all([
      repo.predictions.listUserPredictions(competition.id),
      repo.predictions.listResults(competition.id)
    ]);

    const enriched = bumperSets.map((set) => {
      const setPreds = allPredictions.filter((p) => p.predictionSetId === set.id);
      const setResults = allResults.filter((r) => r.predictionSetId === set.id);

      const questions = (set.questions as unknown as PredictionQuestion[]).map((q) => {
        const myAnswer = setPreds.find((p) => p.questionId === q.id && p.userId === user.id)?.value ?? null;
        const myResult = setResults.find((r) => r.questionId === q.id && r.userId === user.id);
        return {
          ...q,
          myAnswer,
          pointsAwarded: myResult?.pointsAwarded ?? null
        };
      });

      return { ...set, questions };
    });

    return json({ bumperSets: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}
