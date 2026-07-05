import type { Fixture, PredictionResult, PredictionSet, UserPrediction } from "@/domain/models";
import { newId } from "@/server/db/collection";

export type FixtureStats = {
  homeGoals: number;
  awayGoals: number;
  hasRedCard: boolean;
};

// Extended question shape stored in the JSON column.
// Old sets only have { id, prompt, points, options } — new fields are optional for backwards compat.
export type PredictionQuestion = {
  id: string;
  prompt: string;
  type?: "match_winner" | "btts" | "over_under_2_5" | "exact_score" | "red_card" | "champion" | "golden_boot" | "final_score";
  voteMode?: "fixed" | "dynamic";
  points: number;      // max displayable (or exact for fixed)
  basePoints?: number; // dynamic formula base
  minPoints?: number;
  maxPoints?: number;
  options: Array<{ label: string; value: string }>;
};

function dynamicPoints(base: number, min: number, max: number, fraction: number): number {
  if (fraction <= 0) return max;
  return Math.max(min, Math.min(max, Math.floor(base / fraction)));
}

const COMMON_SCORES = [
  "1-0", "2-0", "2-1", "3-0", "3-1", "3-2", "4-0", "4-1",
  "0-0", "1-1", "2-2", "3-3",
  "0-1", "0-2", "1-2", "0-3", "1-3", "2-3",
];

export function createFullPredictionSet(input: {
  competitionId: string;
  fixture: Fixture;
}): PredictionSet {
  const { fixture } = input;
  const t1 = fixture.team1Name ?? "Team 1";
  const t2 = fixture.team2Name ?? "Team 2";

  const questions: PredictionQuestion[] = [
    {
      id: "winner",
      prompt: `Who wins ${t1} vs ${t2}?`,
      type: "match_winner",
      voteMode: "dynamic",
      points: 35,
      basePoints: 5,
      minPoints: 3,
      maxPoints: 35,
      options: [
        { label: t1, value: fixture.team1Id },
        { label: "Draw", value: "draw" },
        { label: t2, value: fixture.team2Id },
      ],
    },
    {
      id: "btts",
      prompt: "Both teams to score?",
      type: "btts",
      voteMode: "dynamic",
      points: 20,
      basePoints: 4,
      minPoints: 3,
      maxPoints: 20,
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ],
    },
    {
      id: "over_under",
      prompt: "Total goals in the match",
      type: "over_under_2_5",
      voteMode: "dynamic",
      points: 20,
      basePoints: 4,
      minPoints: 3,
      maxPoints: 20,
      options: [
        { label: "Over 2.5", value: "over" },
        { label: "Under 2.5", value: "under" },
      ],
    },
    {
      id: "exact_score",
      prompt: "Exact full-time scoreline",
      type: "exact_score",
      voteMode: "fixed",
      points: 20,
      options: COMMON_SCORES.map((s) => {
        const [h, a] = s.split("-");
        return { label: `${h}–${a}`, value: s };
      }),
    },
    {
      id: "red_card",
      prompt: "Will there be a red card?",
      type: "red_card",
      voteMode: "fixed",
      points: 3,
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ],
    },
  ];

  return {
    id: newId(),
    competitionId: input.competitionId,
    fixtureId: fixture.id,
    type: "match_winner",
    status: "open",
    closesAt: fixture.startTime,
    questions: questions as PredictionSet["questions"],
  };
}

export const createMatchWinnerPredictionSet = createFullPredictionSet;

function getCorrectValue(
  type: string,
  fixture: Fixture,
  stats?: FixtureStats
): string | null {
  const score = fixture.score;
  switch (type) {
    case "match_winner":
      return fixture.result?.winnerTeamId ?? null;
    case "btts":
      if (!score) return null;
      return (score.team1 ?? 0) > 0 && (score.team2 ?? 0) > 0 ? "yes" : "no";
    case "over_under_2_5": {
      if (!score) return null;
      return (score.team1 ?? 0) + (score.team2 ?? 0) > 2.5 ? "over" : "under";
    }
    case "exact_score":
      if (!score) return null;
      return `${score.team1 ?? 0}-${score.team2 ?? 0}`;
    case "red_card":
      if (stats == null) return null;
      return stats.hasRedCard ? "yes" : "no";
    default:
      return null;
  }
}

export function scorePredictionSet(input: {
  set: PredictionSet;
  fixture: Fixture;
  predictions: UserPrediction[];
  stats?: FixtureStats;
}): PredictionResult[] {
  const { set, fixture, predictions, stats } = input;
  const setPreds = predictions.filter((p) => p.predictionSetId === set.id);
  const results: PredictionResult[] = [];

  for (const q of set.questions as unknown as PredictionQuestion[]) {
    const qType = q.type ?? "match_winner";
    const correctValue = getCorrectValue(qType, fixture, stats);
    if (correctValue === null) continue;

    const qPreds = setPreds.filter((p) => p.questionId === q.id);
    const totalVotes = qPreds.length;
    const correctVotes = qPreds.filter((p) => p.value === correctValue).length;
    const fraction = totalVotes > 0 ? correctVotes / totalVotes : 0;

    for (const pred of qPreds) {
      let pts = 0;
      if (pred.value === correctValue) {
        if ((q.voteMode ?? "fixed") === "dynamic" && q.basePoints != null) {
          pts = dynamicPoints(q.basePoints, q.minPoints ?? 2, q.maxPoints ?? 50, fraction);
        } else {
          pts = q.points ?? 0;
        }
      }
      results.push({
        id: newId(),
        competitionId: pred.competitionId,
        predictionSetId: set.id,
        questionId: q.id,
        userId: pred.userId,
        pointsAwarded: pts,
      });
    }
  }

  return results;
}

// Score a bumper prediction set (champion/golden_boot/final_score).
// Admin provides the correct answer per question; points are fixed.
export function scoreBumperPrediction(input: {
  set: PredictionSet;
  correctValues: Record<string, string>; // questionId → correct value
  predictions: UserPrediction[];
}): PredictionResult[] {
  const { set, correctValues, predictions } = input;
  const setPreds = predictions.filter((p) => p.predictionSetId === set.id);
  const results: PredictionResult[] = [];

  for (const q of set.questions as unknown as PredictionQuestion[]) {
    const correctValue = correctValues[q.id];
    if (correctValue == null) continue;

    const qPreds = setPreds.filter((p) => p.questionId === q.id);

    for (const pred of qPreds) {
      let pts = 0;
      if (pred.value === correctValue) {
        pts = q.points;
      } else if (q.type === "final_score") {
        // off-by-1 on total goal count gets half points
        const guessed = parseInt(pred.value, 10);
        const correct = parseInt(correctValue, 10);
        if (!isNaN(guessed) && !isNaN(correct) && Math.abs(guessed - correct) === 1) {
          pts = Math.floor(q.points / 4); // 200 pts → 50 pts
        }
      }
      results.push({
        id: newId(),
        competitionId: pred.competitionId,
        predictionSetId: set.id,
        questionId: q.id,
        userId: pred.userId,
        pointsAwarded: pts,
      });
    }
  }

  return results;
}
