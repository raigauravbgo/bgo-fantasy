import { handleApiError, json, requireUser, resolveCompetition } from "@/server/api/http";
import { buildLeaderboard } from "@/server/services/scoring";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireUser();
    const { slug } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);
    const [entry, entries, fixtures, entryPoints, predictionResults, announcements, activePredSets] =
      await Promise.all([
        repo.entries.findByUser(competition.id, user.id),
        repo.entries.list(competition.id),
        repo.fixtures.list(competition.id),
        repo.points.listEntryPoints(competition.id),
        repo.predictions.listResults(competition.id),
        repo.announcements.listActive(competition.id),
        repo.predictions.listActive(competition.id)
      ]);

    const squadPlayers = entry?.playerIds?.length
      ? await repo.players.findMany(entry.playerIds)
      : [];

    const leaderboard = buildLeaderboard({
      entries,
      entryPoints,
      predictionPoints:
        competition.settings.predictionPointsMode === "separate"
          ? []
          : predictionResults.map((result) => ({
              userId: result.userId,
              points: result.pointsAwarded
            }))
    });

    const myRank = entry
      ? leaderboard.find((row) => row.entryId === entry.id)?.rank
      : undefined;
    const myPoints = entry
      ? leaderboard.find((row) => row.entryId === entry.id)?.totalPoints
      : 0;

    const myEntryPoints = entry
      ? entryPoints.filter((ep) => ep.entryId === entry.id)
      : [];
    const fixturePoints = myEntryPoints.map((ep) => ({
      fixtureId: ep.fixtureId,
      points: ep.points
    }));

    const completedFixtures = fixtures.filter((f) => f.status === "completed");
    const lastFixture = completedFixtures.slice(-1)[0] ?? null;
    const lastMatchPoints = lastFixture
      ? (myEntryPoints.find((ep) => ep.fixtureId === lastFixture.id)?.points ?? null)
      : null;

    return json({
      competition,
      entry,
      rank: myRank,
      totalPoints: myPoints,
      upcomingFixtures: fixtures
        .filter((fixture) => fixture.status === "upcoming")
        .slice(0, 5),
      recentFixtures: completedFixtures.slice(-5),
      announcements,
      squadPlayers,
      fixturePoints,
      lastFixture,
      lastMatchPoints,
      activePredictionCount: activePredSets.length
    });
  } catch (error) {
    return handleApiError(error);
  }
}
