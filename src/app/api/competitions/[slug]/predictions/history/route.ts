import { handleApiError, json, requireUser, resolveCompetition } from "@/server/api/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireUser();
    const { slug } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);

    const [allSets, userPredictions, results] = await Promise.all([
      repo.predictions.listSets(competition.id),
      repo.predictions.listUserPredictions(competition.id),
      repo.predictions.listResults(competition.id)
    ]);

    const closedSets = allSets.filter((s) => s.status !== "open");

    const myPredictions = userPredictions.filter((p) => p.userId === user.id);
    const predsByKey: Record<string, string> = {};
    for (const p of myPredictions) {
      predsByKey[`${p.predictionSetId}:${p.questionId}`] = p.value;
    }

    const resultsByUserId: Record<string, number> = {};
    for (const r of results) {
      if (r.userId === user.id) {
        resultsByUserId[r.predictionSetId] = (resultsByUserId[r.predictionSetId] ?? 0) + r.pointsAwarded;
      }
    }

    const history = closedSets.map((set) => ({
      id: set.id,
      fixtureId: set.fixtureId,
      closesAt: set.closesAt,
      status: set.status,
      pointsEarned: resultsByUserId[set.id] ?? null,
      questions: set.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        points: q.points,
        options: q.options,
        myAnswer: predsByKey[`${set.id}:${q.id}`] ?? null
      }))
    }));

    return json({ history });
  } catch (error) {
    return handleApiError(error);
  }
}
