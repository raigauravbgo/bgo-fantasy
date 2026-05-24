import type { SportAdapter } from "@/domain/adapters/sport-adapter";

import { SOCCER_LABELS, SOCCER_POSITIONS, DEFAULT_SOCCER_SQUAD_CONSTRAINTS } from "./rules";
import { calculateSoccerPlayerPoints } from "./scoring";
import type { SoccerRawStats } from "./stats-schema";

export const soccerAdapter: SportAdapter<SoccerRawStats> = {
  sportType: "soccer",
  labels: SOCCER_LABELS,
  positions: [...SOCCER_POSITIONS],
  squadConstraints: DEFAULT_SOCCER_SQUAD_CONSTRAINTS,
  calculatePlayerPoints: calculateSoccerPlayerPoints
};
