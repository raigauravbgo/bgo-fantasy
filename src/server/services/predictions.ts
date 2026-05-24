import type {
  Fixture,
  PredictionResult,
  PredictionSet,
  UserPrediction
} from "@/domain/models";
import { newId } from "@/server/db/collection";

export function createMatchWinnerPredictionSet(input: {
  competitionId: string;
  fixture: Fixture;
}): PredictionSet {
  return {
    id: newId(),
    competitionId: input.competitionId,
    fixtureId: input.fixture.id,
    type: "match_winner",
    status: "open",
    closesAt: input.fixture.startTime,
    questions: [
      {
        id: "winner",
        prompt: "Match winner",
        points: 5,
        options: [
          { label: input.fixture.team1Name ?? "Team 1", value: input.fixture.team1Id },
          { label: "Draw", value: "draw" },
          { label: input.fixture.team2Name ?? "Team 2", value: input.fixture.team2Id }
        ]
      }
    ]
  };
}

export function scorePredictionSet(input: {
  set: PredictionSet;
  fixture: Fixture;
  predictions: UserPrediction[];
}): PredictionResult[] {
  const winner = input.fixture.result?.winnerTeamId;
  if (!winner) return [];

  return input.predictions
    .filter((prediction) => prediction.predictionSetId === input.set.id)
    .map((prediction) => {
      const question = input.set.questions.find(
        (item) => item.id === prediction.questionId
      );

      return {
        id: newId(),
        competitionId: prediction.competitionId,
        predictionSetId: prediction.predictionSetId,
        questionId: prediction.questionId,
        userId: prediction.userId,
        pointsAwarded: prediction.value === winner ? (question?.points ?? 0) : 0
      };
    });
}
