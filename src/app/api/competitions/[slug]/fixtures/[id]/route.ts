import { handleApiError, json, requireUser, resolveCompetition, RequestError } from "@/server/api/http";
import type { PlayerPoints, RawStat } from "@/domain/models";
import type { SoccerRawStats } from "@/domain/adapters/soccer/stats-schema";

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

    const [players, playerPoints, rawStats] = await Promise.all([
      repo.players.list(competition.id),
      repo.points.listPlayerPoints(competition.id, fixtureId) as Promise<PlayerPoints[]>,
      repo.rawStats.listByFixture(fixtureId) as Promise<RawStat[]>
    ]);

    const playerMap = new Map(players.map((p) => [p.id, p]));
    const pointsWithPlayers = playerPoints
      .map((pp) => ({
        ...pp,
        player: playerMap.get(pp.playerId) ?? null
      }))
      .filter((pp) => pp.player !== null)
      .sort((a, b) => b.points - a.points);

    const rawStatMap = new Map(rawStats.map((rs) => [rs.playerId, rs.stats as SoccerRawStats]));
    const playerStats = players
      .filter((p) => rawStatMap.has(p.id))
      .map((p) => ({
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        teamShortName: p.teamShortName,
        stats: rawStatMap.get(p.id)!
      }))
      .sort((a, b) => {
        const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
        return (posOrder[a.position] ?? 4) - (posOrder[b.position] ?? 4);
      });

    return json({ fixture, playerPoints: pointsWithPlayers, playerStats });
  } catch (error) {
    return handleApiError(error);
  }
}
