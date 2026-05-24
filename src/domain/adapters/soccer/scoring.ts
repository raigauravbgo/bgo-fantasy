import type {
  PlayerPointResult,
  ScoringBreakdownItem
} from "@/domain/adapters/sport-adapter";

import type { SoccerRawStats } from "./stats-schema";

const DEFENSIVE_POSITIONS = new Set(["GK", "DEF"]);

function addBreakdown(
  breakdown: ScoringBreakdownItem[],
  category: string,
  label: string,
  quantity: number | undefined,
  pointsPerUnit: number
) {
  if (!quantity) {
    return;
  }

  breakdown.push({
    category,
    label,
    quantity,
    pointsPerUnit,
    total: quantity * pointsPerUnit
  });
}

export function calculateSoccerPlayerPoints({
  position,
  stats
}: {
  position: string;
  stats: SoccerRawStats;
}): PlayerPointResult {
  const breakdown: ScoringBreakdownItem[] = [];

  addBreakdown(breakdown, "appearance", "Started match", stats.started ? 1 : 0, 2);
  addBreakdown(
    breakdown,
    "appearance",
    "Substitute appearance",
    stats.substituteAppearance ? 1 : 0,
    1
  );
  addBreakdown(
    breakdown,
    "appearance",
    "Played 60+ minutes",
    (stats.minutesPlayed ?? 0) >= 60 ? 1 : 0,
    2
  );

  const goalPoints =
    position === "GK" || position === "DEF" ? 6 : position === "MID" ? 5 : 4;
  addBreakdown(breakdown, "attack", "Goals", stats.goals, goalPoints);
  addBreakdown(breakdown, "attack", "Assists", stats.assists, 3);

  if (position === "MID") {
    addBreakdown(
      breakdown,
      "defense",
      "Clean sheet",
      stats.cleanSheet ? 1 : 0,
      1
    );
  }

  if (DEFENSIVE_POSITIONS.has(position)) {
    addBreakdown(
      breakdown,
      "defense",
      "Clean sheet",
      stats.cleanSheet ? 1 : 0,
      4
    );

    addBreakdown(
      breakdown,
      "defense",
      "Goals conceded",
      Math.floor((stats.goalsConceded ?? 0) / 2),
      -1
    );
  }

  addBreakdown(
    breakdown,
    "goalkeeping",
    "Saves",
    Math.floor((stats.saves ?? 0) / 3),
    1
  );
  addBreakdown(
    breakdown,
    "goalkeeping",
    "Penalty saves",
    stats.penaltySaves,
    5
  );

  addBreakdown(breakdown, "discipline", "Yellow cards", stats.yellowCards, -1);
  addBreakdown(breakdown, "discipline", "Red cards", stats.redCards, -3);
  addBreakdown(
    breakdown,
    "penalties",
    "Penalty misses",
    stats.penaltyMisses,
    -2
  );
  addBreakdown(breakdown, "penalties", "Own goals", stats.ownGoals, -2);
  addBreakdown(
    breakdown,
    "bonus",
    "Player of the match",
    stats.playerOfTheMatch ? 1 : 0,
    3
  );

  return {
    points: breakdown.reduce((total, item) => total + item.total, 0),
    breakdown
  };
}
