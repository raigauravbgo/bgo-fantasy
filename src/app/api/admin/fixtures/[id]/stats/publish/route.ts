import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { calculateFixtureScoring } from "@/server/services/scoring";
import { scorePredictionSet } from "@/server/services/predictions";

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

    // Use score from request body, or fall back to score already on the fixture
    // (stored by the fetch-live step when admin fetched stats from API-Football)
    const score = input.score ?? (
      fixture.score?.team1 != null && fixture.score?.team2 != null
        ? { team1: fixture.score.team1, team2: fixture.score.team2 }
        : undefined
    );

    const updatedResult = score
      ? {
          winnerTeamId:
            score.team1 > score.team2
              ? fixture.team1Id
              : score.team2 > score.team1
                ? fixture.team2Id
                : "draw"
        }
      : fixture.result;

    await repo.fixtures.update(fixtureId, {
      status: "completed",
      score: score ?? fixture.score,
      result: updatedResult,
    });

    // Auto-score any open/closed prediction sets for this fixture
    if (score) {
      const allSets = await repo.predictions.listSets(fixture.competitionId);
      const fixtureSets = allSets.filter(
        (s) => s.fixtureId === fixtureId && (s.status === "open" || s.status === "closed")
      );
      if (fixtureSets.length > 0) {
        const allPredictions = await repo.predictions.listUserPredictions(fixture.competitionId);
        const hasRedCard = rawStats.some((s) => (s.stats?.redCards ?? 0) > 0);
        const updatedFixture = { ...fixture, score, result: updatedResult };
        for (const set of fixtureSets) {
          const results = scorePredictionSet({
            set,
            fixture: updatedFixture,
            predictions: allPredictions,
            stats: { homeGoals: score.team1, awayGoals: score.team2, hasRedCard },
          });
          if (results.length > 0) {
            await repo.predictions.replaceResults(fixture.competitionId, set.id, results);
          }
          await repo.predictions.upsertSet({ ...set, status: "scored" });
        }
      }
    }

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
