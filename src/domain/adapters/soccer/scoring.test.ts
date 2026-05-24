import { describe, expect, it } from "vitest";

import { calculateSoccerPlayerPoints } from "./scoring";

describe("calculateSoccerPlayerPoints", () => {
  it("awards defensive goal and clean sheet points", () => {
    const result = calculateSoccerPlayerPoints({
      position: "DEF",
      stats: {
        started: true,
        minutesPlayed: 90,
        goals: 1,
        cleanSheet: true
      }
    });

    expect(result.points).toBe(14);
    expect(result.breakdown.map((item) => item.label)).toContain("Goals");
  });

  it("applies goalkeeper save and goals-conceded rules", () => {
    const result = calculateSoccerPlayerPoints({
      position: "GK",
      stats: {
        started: true,
        minutesPlayed: 90,
        goalsConceded: 5,
        saves: 7,
        penaltySaves: 1
      }
    });

    expect(result.points).toBe(9);
  });
});
