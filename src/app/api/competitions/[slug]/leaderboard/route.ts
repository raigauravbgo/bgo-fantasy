import type { NextRequest } from "next/server";
import { handleApiError, json, requireUser, resolveCompetition } from "@/server/api/http";
import { buildLeaderboard } from "@/server/services/scoring";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await requireUser();
    const { slug } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);

    const fixtureId = request.nextUrl.searchParams.get("fixtureId") ?? undefined;

    const [entries, entryPoints, predictionResults] = await Promise.all([
      repo.entries.list(competition.id),
      repo.points.listEntryPoints(competition.id, fixtureId),
      fixtureId ? Promise.resolve([]) : repo.predictions.listResults(competition.id)
    ]);

    return json({
      leaderboard: buildLeaderboard({
        entries,
        entryPoints,
        predictionPoints:
          fixtureId || competition.settings.predictionPointsMode === "separate"
            ? []
            : predictionResults.map((result) => ({
                userId: result.userId,
                points: result.pointsAwarded
              }))
      })
    });
  } catch (error) {
    return handleApiError(error);
  }
}
