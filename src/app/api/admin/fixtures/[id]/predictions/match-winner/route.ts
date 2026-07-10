import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { createMatchWinnerPredictionSet } from "@/server/services/predictions";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const repo = platformRepository();
    const fixture = await repo.fixtures.findById(id);
    if (!fixture) throw new RequestError("Fixture not found", 404);

    const existingSets = await repo.predictions.listSets(fixture.competitionId);
    const existing = existingSets.find((s) => s.fixtureId === fixture.id && s.type === "match_winner");
    if (existing) return json({ predictionSet: existing });

    const set = await repo.predictions.upsertSet(
      createMatchWinnerPredictionSet({
        competitionId: fixture.competitionId,
        fixture
      })
    );

    await repo.audit.create({
      actorUserId: admin.id,
      action: "predictions.create_match_winner",
      entityType: "prediction_set",
      entityId: set.id,
      competitionId: fixture.competitionId,
      after: set
    });

    return json({ predictionSet: set });
  } catch (error) {
    return handleApiError(error);
  }
}
