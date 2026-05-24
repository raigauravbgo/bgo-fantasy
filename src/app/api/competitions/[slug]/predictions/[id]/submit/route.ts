import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireUser, RequestError, resolveCompetition } from "@/server/api/http";

const schema = z.object({
  questionId: z.string(),
  value: z.string()
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const user = await requireUser();
    const { slug, id } = await context.params;
    const input = await parseJson(request, schema);
    const { repo, competition } = await resolveCompetition(slug);
    const set = await repo.predictions.findSet(id);

    if (!set || set.competitionId !== competition.id) {
      throw new RequestError("Prediction set not found", 404);
    }

    if (set.closesAt <= new Date()) {
      throw new RequestError("Prediction is closed", 403);
    }

    const prediction = await repo.predictions.submit({
      competitionId: competition.id,
      predictionSetId: set.id,
      questionId: input.questionId,
      userId: user.id,
      value: input.value
    });

    return json({ prediction });
  } catch (error) {
    return handleApiError(error);
  }
}
