import { handleApiError, json, requireUser, resolveCompetition } from "@/server/api/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await requireUser();
    const { slug } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);

    const [players, allPlayerPoints] = await Promise.all([
      repo.players.list(competition.id),
      repo.points.listPlayerPoints(competition.id)
    ]);

    // Aggregate total points per player across all published scoring runs
    const totalPointsMap = new Map<string, number>();
    for (const pp of allPlayerPoints) {
      totalPointsMap.set(pp.playerId, (totalPointsMap.get(pp.playerId) ?? 0) + pp.points);
    }

    return json({
      players: players.map((player) => ({
        ...player,
        totalPoints: totalPointsMap.get(player.id) ?? 0
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}
