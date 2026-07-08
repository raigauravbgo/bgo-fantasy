import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { newId } from "@/server/db/collection";
import { platformRepository } from "@/server/repositories/platform";
import type { PredictionSet } from "@/domain/models";

const createSchema = z.object({
  bumperType: z.enum(["champion", "golden_boot", "final_score", "finalists", "third_place_match", "third_place_winner"]),
  label: z.string().min(1),
  durationHours: z.number().int().min(1).max(168)
});

const BUMPER_LABELS: Record<string, string> = {
  champion: "Champion Predictor",
  golden_boot: "Golden Boot",
  final_score: "Final Score Predictor",
  finalists: "Who Will Be In The Final?",
  third_place_match: "Who Plays For 3rd Place?",
  third_place_winner: "Who Wins 3rd Place?"
};

/** Get unique teams from upcoming fixtures (QF teams once QFs are scheduled). */
async function getUpcomingTeamOptions(competitionId: string): Promise<Array<{ label: string; value: string }>> {
  const repo = platformRepository();
  const fixtures = await repo.fixtures.list(competitionId);
  const upcoming = fixtures.filter((f) => f.status === "upcoming");

  const teamMap = new Map<string, string>();
  for (const f of upcoming) {
    if (f.team1Id && f.team1Name) teamMap.set(f.team1Id, f.team1Name);
    if (f.team2Id && f.team2Name) teamMap.set(f.team2Id, f.team2Name);
  }

  return Array.from(teamMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ label, value }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id: competitionId } = await context.params;
    const repo = platformRepository();

    const [allSets, allPredictions] = await Promise.all([
      repo.predictions.listSets(competitionId),
      repo.predictions.listUserPredictions(competitionId)
    ]);

    const bumperSets = allSets
      .filter((s) => s.type === "bumper" || !s.fixtureId)
      .map((set) => {
        const setPreds = allPredictions.filter((p) => p.predictionSetId === set.id);
        const totalParticipants = new Set(setPreds.map((p) => p.userId)).size;
        return { ...set, totalParticipants };
      });

    return json({ bumperSets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminUser();
    const { id: competitionId } = await context.params;
    const input = await parseJson(request, createSchema);
    const repo = platformRepository();

    const competition = await repo.competitions.findById(competitionId);
    if (!competition) throw new RequestError("Competition not found", 404);

    const label = input.label;
    const existing = await repo.predictions.listSets(competitionId);
    const existingBumper = existing.find(
      (s) => (s.type === "bumper" || !s.fixtureId) && s.label === label
    );
    if (existingBumper) {
      throw new RequestError(`A bumper prediction with label "${label}" already exists`, 409);
    }

    const closesAt = new Date(Date.now() + input.durationHours * 60 * 60 * 1000);

    let options: Array<{ label: string; value: string }> = [];
    let prompt = "";
    let points = 100;

    switch (input.bumperType) {
      case "champion": {
        const players = await repo.players.list(competitionId);
        const teamMap = new Map<string, string>();
        for (const p of players) {
          if (p.teamId && p.teamName && !teamMap.has(p.teamId)) teamMap.set(p.teamId, p.teamName);
        }
        options = Array.from(teamMap.entries())
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([value, label]) => ({ label, value }));
        prompt = "Which team will win the World Cup?";
        points = 100;
        break;
      }
      case "golden_boot": {
        const players = await repo.players.list(competitionId);
        options = players
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => ({ label: `${p.name}${p.teamShortName ? ` (${p.teamShortName})` : ""}`, value: p.id }));
        prompt = "Who will win the Golden Boot (top scorer)?";
        points = 100;
        break;
      }
      case "final_score": {
        options = Array.from({ length: 11 }, (_, i) => ({
          label: i === 1 ? "1 goal" : `${i} goals`,
          value: String(i)
        }));
        prompt = "How many total goals will be scored in the final?";
        points = 200;
        break;
      }
      case "finalists": {
        options = await getUpcomingTeamOptions(competitionId);
        if (options.length < 2) throw new RequestError("Not enough upcoming fixture teams found. Import QF fixtures first.", 400);
        prompt = "Which two teams will play in the final?";
        points = 100;
        break;
      }
      case "third_place_match": {
        options = await getUpcomingTeamOptions(competitionId);
        if (options.length < 2) throw new RequestError("Not enough upcoming fixture teams found. Import QF fixtures first.", 400);
        prompt = "Which two teams will play for 3rd place?";
        points = 100;
        break;
      }
      case "third_place_winner": {
        options = await getUpcomingTeamOptions(competitionId);
        if (options.length < 2) throw new RequestError("Not enough upcoming fixture teams found. Import QF fixtures first.", 400);
        prompt = "Which team will finish 3rd?";
        points = 150;
        break;
      }
    }

    const set: PredictionSet = {
      id: newId(),
      competitionId,
      fixtureId: null,
      label,
      type: "bumper",
      status: "open",
      closesAt,
      questions: [
        {
          id: input.bumperType,
          prompt,
          type: input.bumperType,
          voteMode: "fixed",
          points,
          options
        }
      ]
    };

    const saved = await repo.predictions.upsertSet(set);

    await repo.audit.create({
      actorUserId: admin.id,
      action: "bumper_prediction.create",
      entityType: "prediction_set",
      entityId: saved.id,
      competitionId,
      after: { bumperType: input.bumperType, label }
    });

    return json({ set: saved }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
