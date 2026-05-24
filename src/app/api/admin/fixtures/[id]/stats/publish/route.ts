import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { calculateFixtureScoring } from "@/server/services/scoring";

const schema = z.object({
  score: z
    .object({
      team1: z.number().int().min(0),
      team2: z.number().int().min(0)
    })
    .optional()
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id: fixtureId } = await context.params;
    const input = await parseJson(request, schema);
    const repo = platformRepository();
    const fixture = await repo.fixtures.findById(fixtureId);
    if (!fixture) throw new RequestError("Fixture not found", 404);

    const [rawStats, players, entries] = await Promise.all([
      repo.rawStats.listByFixture(fixtureId),
      repo.players.list(fixture.competitionId),
      repo.entries.list(fixture.competitionId)
    ]);

    const scoring = calculateFixtureScoring({
      competitionId: fixture.competitionId,
      fixtureId,
      rawStats,
      players,
      entries,
      actorUserId: admin.id,
      status: "published"
    });

    await repo.points.replaceFixturePoints({
      competitionId: fixture.competitionId,
      fixtureId,
      ...scoring
    });

    const score = input.score;
    await repo.fixtures.update(fixtureId, {
      status: "completed",
      score,
      result: score
        ? {
            winnerTeamId:
              score.team1 > score.team2
                ? fixture.team1Id
                : score.team2 > score.team1
                  ? fixture.team2Id
                  : "draw"
          }
        : fixture.result
    });

    await repo.audit.create({
      actorUserId: admin.id,
      action: "scoring.publish",
      entityType: "fixture",
      entityId: fixtureId,
      competitionId: fixture.competitionId,
      after: { runId: scoring.run.id }
    });

    return json(scoring);
  } catch (error) {
    return handleApiError(error);
  }
}
