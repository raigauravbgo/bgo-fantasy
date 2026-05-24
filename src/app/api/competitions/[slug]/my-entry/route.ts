import { type NextRequest } from "next/server";
import { z } from "zod";

import { soccerAdapter } from "@/domain/adapters/soccer";
import { validateSquad } from "@/domain/fantasy/squad-validation";
import { handleApiError, json, parseJson, requireUser, RequestError, resolveCompetition } from "@/server/api/http";

const schema = z.object({
  name: z.string().min(2),
  mascotUrl: z.string().optional(),
  playerIds: z.array(z.string()).min(1).max(15),
  captainId: z.string(),
  viceCaptainId: z.string()
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireUser();
    const { slug } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);
    return json({
      entry: await repo.entries.findByUser(competition.id, user.id)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireUser();
    const { slug } = await context.params;
    const input = await parseJson(request, schema);
    const { repo, competition } = await resolveCompetition(slug);
    const existing = await repo.entries.findByUser(competition.id, user.id);

    if (!existing && !competition.registrationOpen) {
      throw new RequestError("Registration is currently closed", 403);
    }

    const transferWindow = competition.settings.transferWindow;

    if (existing?.locked && !transferWindow?.active) {
      throw new RequestError("Locked squads cannot be edited outside a transfer window", 403);
    }

    const players = await repo.players.findMany(input.playerIds);
    const constraints = {
      ...soccerAdapter.squadConstraints,
      budget: competition.settings.budget ?? soccerAdapter.squadConstraints.budget,
      maxPlayersPerTeam:
        competition.settings.maxPlayersPerTeam ??
        soccerAdapter.squadConstraints.maxPlayersPerTeam
    };
    const validation = validateSquad({
      players,
      captainId: input.captainId,
      viceCaptainId: input.viceCaptainId,
      constraints,
      allowUnavailablePlayers: competition.settings.allowUnavailablePlayers
    });

    if (!validation.valid) {
      throw new RequestError("Invalid squad", 422, validation.errors);
    }

    const changedPlayers = existing
      ? input.playerIds.filter((id) => !existing.playerIds.includes(id)).length
      : 0;
    const nextTransferUsage = existing?.locked
      ? (existing.transferUsage ?? 0) + changedPlayers
      : existing?.transferUsage ?? 0;

    if (
      existing?.locked &&
      transferWindow?.active &&
      nextTransferUsage > transferWindow.maxTransfers
    ) {
      throw new RequestError("Transfer limit exceeded", 403);
    }

    const entry = await repo.entries.save({
      competitionId: competition.id,
      userId: user.id,
      name: input.name,
      mascotUrl: input.mascotUrl,
      playerIds: input.playerIds,
      captainId: input.captainId,
      viceCaptainId: input.viceCaptainId,
      budgetUsed: validation.budgetUsed,
      locked: existing?.locked ?? false,
      lockedAt: existing?.locked ? (existing.lockedAt ?? new Date()) : null,
      transferUsage: nextTransferUsage
    });

    return json({ entry, validation });
  } catch (error) {
    return handleApiError(error);
  }
}
