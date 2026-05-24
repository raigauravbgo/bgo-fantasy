import { soccerAdapter } from "@/domain/adapters/soccer";
import type {
  EntryPoints,
  FantasyEntry,
  Player,
  PlayerPoints,
  RawStat,
  ScoringRun
} from "@/domain/models";
import { newId } from "@/server/db/collection";

type ScoringPreview = {
  run: ScoringRun;
  playerPoints: PlayerPoints[];
  entryPoints: EntryPoints[];
};

export function calculateFixtureScoring(input: {
  competitionId: string;
  fixtureId: string;
  rawStats: RawStat[];
  players: Player[];
  entries: FantasyEntry[];
  actorUserId: string;
  status: "preview" | "published";
}): ScoringPreview {
  const run: ScoringRun = {
    id: newId(),
    competitionId: input.competitionId,
    fixtureId: input.fixtureId,
    status: input.status,
    createdBy: input.actorUserId,
    createdAt: new Date(),
    summary: {
      rawStats: input.rawStats.length,
      entries: input.entries.length
    }
  };

  const playersById = new Map(input.players.map((player) => [player.id, player]));
  const playerPoints: PlayerPoints[] = input.rawStats.flatMap((rawStat) => {
    const player = playersById.get(rawStat.playerId);
    if (!player) return [];
    const result = soccerAdapter.calculatePlayerPoints({
      position: player.position,
      stats: rawStat.stats
    });
    return [{
      id: newId(),
      competitionId: input.competitionId,
      fixtureId: input.fixtureId,
      playerId: player.id,
      points: result.points,
      breakdown: result.breakdown,
      scoringRunId: run.id
    }];
  });

  const pointsByPlayer = new Map(playerPoints.map((pp) => [pp.playerId, pp]));

  const entryPoints = input.entries.map((entry) => {
    const breakdown = entry.playerIds.map((playerId) => {
      const basePoints = pointsByPlayer.get(playerId)?.points ?? 0;
      const captaincyRole: "captain" | "vice_captain" | undefined =
        playerId === entry.captainId
          ? "captain"
          : playerId === entry.viceCaptainId
            ? "vice_captain"
            : undefined;
      const multiplier =
        captaincyRole === "captain"
          ? 2
          : captaincyRole === "vice_captain"
            ? 1.5
            : 1;

      return {
        playerId,
        basePoints,
        multiplier,
        finalPoints: basePoints * multiplier,
        captaincyRole
      };
    });

    return {
      id: newId(),
      competitionId: input.competitionId,
      fixtureId: input.fixtureId,
      entryId: entry.id,
      userId: entry.userId,
      points: breakdown.reduce((sum, item) => sum + item.finalPoints, 0),
      breakdown,
      scoringRunId: run.id
    };
  });

  return { run, playerPoints, entryPoints };
}

export function buildLeaderboard(input: {
  entries: FantasyEntry[];
  entryPoints: EntryPoints[];
  predictionPoints?: Array<{ userId: string; points: number }>;
}) {
  const totals = new Map<string, number>();

  for (const point of input.entryPoints) {
    totals.set(point.entryId, (totals.get(point.entryId) ?? 0) + point.points);
  }

  const predictionTotals = new Map<string, number>();
  for (const point of input.predictionPoints ?? []) {
    predictionTotals.set(
      point.userId,
      (predictionTotals.get(point.userId) ?? 0) + point.points
    );
  }

  return input.entries
    .map((entry) => ({
      entryId: entry.id,
      userId: entry.userId,
      name: entry.name,
      mascotUrl: entry.mascotUrl,
      totalPoints: (totals.get(entry.id) ?? 0) + (predictionTotals.get(entry.userId) ?? 0),
      budgetUsed: entry.budgetUsed,
      lockedAt: entry.lockedAt
    }))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (a.budgetUsed !== b.budgetUsed) return a.budgetUsed - b.budgetUsed;
      return (a.lockedAt?.getTime() ?? Infinity) - (b.lockedAt?.getTime() ?? Infinity);
    })
    .map((row, index) => ({ rank: index + 1, ...row }));
}
