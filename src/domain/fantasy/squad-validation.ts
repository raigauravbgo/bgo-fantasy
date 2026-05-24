import type { SquadConstraint } from "@/domain/adapters/sport-adapter";

export type SquadPlayer = {
  id: string;
  teamId: string;
  position: string;
  price: number;
  status: "available" | "doubtful" | "injured" | "suspended" | "unavailable";
};

export type SquadValidationInput = {
  players: SquadPlayer[];
  captainId?: string | null;
  viceCaptainId?: string | null;
  constraints: SquadConstraint;
  allowUnavailablePlayers?: boolean;
};

export type SquadValidationResult = {
  valid: boolean;
  errors: string[];
  budgetUsed: number;
  positionCounts: Record<string, number>;
  teamCounts: Record<string, number>;
};

export function validateSquad({
  players,
  captainId,
  viceCaptainId,
  constraints,
  allowUnavailablePlayers = false
}: SquadValidationInput): SquadValidationResult {
  const errors: string[] = [];
  const playerIds = new Set(players.map((player) => player.id));
  const budgetUsed = players.reduce((total, player) => total + player.price, 0);
  const positionCounts: Record<string, number> = {};
  const teamCounts: Record<string, number> = {};

  for (const player of players) {
    positionCounts[player.position] = (positionCounts[player.position] ?? 0) + 1;
    teamCounts[player.teamId] = (teamCounts[player.teamId] ?? 0) + 1;

    if (!allowUnavailablePlayers && player.status === "unavailable") {
      errors.push(`${player.id} is unavailable`);
    }
  }

  if (players.length !== constraints.squadSize) {
    errors.push(`Squad must contain exactly ${constraints.squadSize} players`);
  }

  if (budgetUsed > constraints.budget) {
    errors.push(`Budget used must not exceed ${constraints.budget}`);
  }

  for (const [position, limit] of Object.entries(constraints.positionLimits)) {
    const count = positionCounts[position] ?? 0;

    if (count < limit.min || count > limit.max) {
      errors.push(
        `${position} count must be between ${limit.min} and ${limit.max}`
      );
    }
  }

  for (const [teamId, count] of Object.entries(teamCounts)) {
    if (count > constraints.maxPlayersPerTeam) {
      errors.push(
        `${teamId} has ${count} players, max is ${constraints.maxPlayersPerTeam}`
      );
    }
  }

  if (!captainId || !playerIds.has(captainId)) {
    errors.push("Captain must be in the squad");
  }

  if (!viceCaptainId || !playerIds.has(viceCaptainId)) {
    errors.push("Vice-captain must be in the squad");
  }

  if (captainId && viceCaptainId && captainId === viceCaptainId) {
    errors.push("Captain and vice-captain must be different players");
  }

  return {
    valid: errors.length === 0,
    errors,
    budgetUsed,
    positionCounts,
    teamCounts
  };
}
