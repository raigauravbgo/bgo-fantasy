import { type NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { newId } from "@/server/db/collection";
import { platformRepository } from "@/server/repositories/platform";
import type { PredictionSet } from "@/domain/models";

const createSchema = z.object({
  bumperType: z.enum(["champion", "golden_boot", "final_score"]),
  label: z.string().min(1),
  closesAt: z.string().datetime()
});

const BUMPER_LABELS: Record<string, string> = {
  champion: "Champion Predictor",
  golden_boot: "Golden Boot",
  final_score: "Final Score Predictor"
};

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

    // Check if bumper set of this type already exists
    const existing = await repo.predictions.listSets(competitionId);
    const existingBumper = existing.find(
      (s) => (s.type === "bumper" || !s.fixtureId) && s.label === input.label
    );
    if (existingBumper) {
      throw new RequestError(`A bumper prediction with label "${input.label}" already exists`, 409);
    }

    let options: Array<{ label: string; value: string }> = [];
    let prompt = "";
    let points = 100;

    if (input.bumperType === "champion") {
      const players = await repo.players.list(competitionId);
      const teamMap = new Map<string, string>();
      for (const p of players) {
        if (p.teamId && p.teamName && !teamMap.has(p.teamId)) {
          teamMap.set(p.teamId, p.teamName);
        }
      }
      options = Array.from(teamMap.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ label, value }));
      prompt = "Which team will win the World Cup?";
      points = 100;
    } else if (input.bumperType === "golden_boot") {
      const players = await repo.players.list(competitionId);
      options = players
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ label: `${p.name}${p.teamShortName ? ` (${p.teamShortName})` : ""}`, value: p.id }));
      prompt = "Who will win the Golden Boot (top scorer)?";
      points = 100;
    } else {
      // final_score: total goals 0-10
      options = Array.from({ length: 11 }, (_, i) => ({
        label: i === 1 ? "1 goal" : `${i} goals`,
        value: String(i)
      }));
      prompt = "How many total goals will be scored in the final?";
      points = 200;
    }

    const set: PredictionSet = {
      id: newId(),
      competitionId,
      fixtureId: null,
      label: input.label,
      type: "bumper",
      status: "open",
      closesAt: new Date(input.closesAt),
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
      after: { bumperType: input.bumperType, label: input.label }
    });

    return json({ set: saved }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
