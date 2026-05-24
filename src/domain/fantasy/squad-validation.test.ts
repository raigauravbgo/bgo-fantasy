import { describe, expect, it } from "vitest";

import { DEFAULT_SOCCER_SQUAD_CONSTRAINTS } from "@/domain/adapters/soccer/rules";

import { type SquadPlayer, validateSquad } from "./squad-validation";

const validPlayers: SquadPlayer[] = [
  { id: "p1", teamId: "ARG", position: "GK", price: 8, status: "available" },
  { id: "p2", teamId: "ARG", position: "DEF", price: 8, status: "available" },
  { id: "p3", teamId: "ARG", position: "DEF", price: 8, status: "available" },
  { id: "p4", teamId: "BRA", position: "DEF", price: 8, status: "available" },
  { id: "p5", teamId: "BRA", position: "MID", price: 9, status: "available" },
  { id: "p6", teamId: "BRA", position: "MID", price: 9, status: "available" },
  { id: "p7", teamId: "FRA", position: "MID", price: 9, status: "available" },
  { id: "p8", teamId: "FRA", position: "MID", price: 9, status: "available" },
  { id: "p9", teamId: "FRA", position: "FWD", price: 10, status: "available" },
  { id: "p10", teamId: "ESP", position: "FWD", price: 10, status: "available" },
  { id: "p11", teamId: "ENG", position: "FWD", price: 10, status: "available" }
];

describe("validateSquad", () => {
  it("accepts a valid soccer squad", () => {
    const result = validateSquad({
      players: validPlayers,
      captainId: "p9",
      viceCaptainId: "p7",
      constraints: DEFAULT_SOCCER_SQUAD_CONSTRAINTS
    });

    expect(result.valid).toBe(true);
    expect(result.budgetUsed).toBe(98);
  });

  it("rejects unavailable players and duplicate captaincy", () => {
    const result = validateSquad({
      players: [
        ...validPlayers.slice(0, 10),
        { ...validPlayers[10], status: "unavailable" }
      ],
      captainId: "p9",
      viceCaptainId: "p9",
      constraints: DEFAULT_SOCCER_SQUAD_CONSTRAINTS
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "p11 is unavailable",
        "Captain and vice-captain must be different players"
      ])
    );
  });
});
