import { handleApiError, json, requireUser, resolveCompetition, RequestError } from "@/server/api/http";
import type { PlayerPoints } from "@/domain/models";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    await requireUser();
    const { slug, id: fixtureId } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);

    const fixture = await repo.fixtures.findById(fixtureId);
    if (!fixture || fixture.competitionId !== competition.id) {
      throw new RequestError("Fixture not found", 404);
    }

    const [players, playerPoints] = await Promise.all([
      repo.players.list(competition.id),
      repo.points.listPlayerPoints(competition.id, fixtureId) as Promise<PlayerPoints[]>
    ]);

    const playerMap = new Map(players.map((p) => [p.id, p]));
    const pointsWithPlayers = playerPoints
      .map((pp) => ({
        ...pp,
        player: playerMap.get(pp.playerId) ?? null
      }))
      .filter((pp) => pp.player !== null)
      .sort((a, b) => b.points - a.points);

    return json({ fixture, playerPoints: pointsWithPlayers });
  } catch (error) {
    return handleApiError(error);
  }
}
