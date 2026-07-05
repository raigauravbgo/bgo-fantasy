import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { scoreBumperPrediction, scorePredictionSet } from "@/server/services/predictions";

const bumperScoreSchema = z.object({
  correctValues: z.record(z.string(), z.string())
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const repo = platformRepository();
    const set = await repo.predictions.findSet(id);
    if (!set) throw new RequestError("Prediction set not found", 404);

    const predictions = await repo.predictions.listUserPredictions(set.competitionId);
    let results;

    if (set.type === "bumper" || !set.fixtureId) {
      const input = await parseJson(request, bumperScoreSchema);
      results = scoreBumperPrediction({ set, correctValues: input.correctValues, predictions });
    } else {
      const fixture = await repo.fixtures.findById(set.fixtureId);
      if (!fixture) throw new RequestError("Fixture not found", 404);
      results = scorePredictionSet({ set, fixture, predictions });
    }

    await repo.predictions.replaceResults(set.competitionId, set.id, results);
    await repo.predictions.upsertSet({ ...set, status: "scored" });
    await repo.audit.create({
      actorUserId: admin.id,
      action: "predictions.score",
      entityType: "prediction_set",
      entityId: set.id,
      competitionId: set.competitionId,
      after: { count: results.length }
    });

    return json({ results, count: results.length });
  } catch (error) {
    return handleApiError(error);
  }
}
