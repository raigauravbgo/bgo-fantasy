import type { SquadConstraint } from "@/domain/adapters/sport-adapter";

export const SOCCER_POSITIONS = [
  { code: "GK", label: "Goalkeeper" },
  { code: "DEF", label: "Defender" },
  { code: "MID", label: "Midfielder" },
  { code: "FWD", label: "Forward" }
] as const;

export const DEFAULT_SOCCER_SQUAD_CONSTRAINTS: SquadConstraint = {
  squadSize: 15,
  budget: 100,
  maxPlayersPerTeam: 3,
  positionLimits: {
    GK:  { min: 2, max: 2 },
    DEF: { min: 5, max: 5 },
    MID: { min: 5, max: 5 },
    FWD: { min: 3, max: 3 }
  }
};

export const SOCCER_LABELS = {
  team: "Country",
  fixture: "Fixture",
  position: "Position",
  player: "Player"
};
