import { handleApiError, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const POSITION_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id: fixtureId } = await context.params;
    const repo = platformRepository();
    const fixture = await repo.fixtures.findById(fixtureId);
    if (!fixture) throw new RequestError("Fixture not found", 404);

    const allPlayers = await repo.players.list(fixture.competitionId);
    const teamPlayers = allPlayers.filter(
      (p) => p.teamId === fixture.team1Id || p.teamId === fixture.team2Id
    );

    teamPlayers.sort((a, b) => {
      const teamOrder = a.teamId === fixture.team1Id ? 0 : 1;
      const bTeamOrder = b.teamId === fixture.team1Id ? 0 : 1;
      if (teamOrder !== bTeamOrder) return teamOrder - bTeamOrder;
      const posDiff =
        (POSITION_ORDER[a.position as keyof typeof POSITION_ORDER] ?? 9) -
        (POSITION_ORDER[b.position as keyof typeof POSITION_ORDER] ?? 9);
      return posDiff !== 0 ? posDiff : a.name.localeCompare(b.name);
    });

    const header = "playerName,team,position,minutesPlayed,started,goals,assists,yellowCards,redCards,saves,cleanSheet,goalsConceded,penaltySaves";
    const rows = teamPlayers.map((p) =>
      [p.name, p.teamShortName ?? "", p.position, "", "", "", "", "", "", "", "", "", ""].join(",")
    );

    const csv = [header, ...rows].join("\r\n");
    const filename = `stats-${fixture.team1Name ?? "home"}-vs-${fixture.team2Name ?? "away"}.csv`
      .replace(/[^a-z0-9._-]/gi, "-")
      .toLowerCase();

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
