import type { SportType } from "@/domain/competition/types";

export type PositionDefinition = {
  code: string;
  label: string;
};

export type SquadConstraint = {
  squadSize: number;
  budget: number;
  maxPlayersPerTeam: number;
  positionLimits: Record<string, { min: number; max: number }>;
};

export type ScoringBreakdownItem = {
  category: string;
  label: string;
  quantity: number;
  pointsPerUnit: number;
  total: number;
};

export type PlayerPointResult = {
  points: number;
  breakdown: ScoringBreakdownItem[];
};

export type SportAdapter<TRawStats extends Record<string, unknown>> = {
  sportType: SportType;
  labels: {
    team: string;
    fixture: string;
    position: string;
    player: string;
  };
  positions: PositionDefinition[];
  squadConstraints: SquadConstraint;
  calculatePlayerPoints(params: {
    position: string;
    stats: TRawStats;
  }): PlayerPointResult;
};
