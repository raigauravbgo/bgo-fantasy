import { handleApiError, json, requireUser, RequestError, resolveCompetition } from "@/server/api/http";

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireUser();
    const { slug } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);
    const entry = await repo.entries.findByUser(competition.id, user.id);

    if (!entry) throw new RequestError("Create a squad before locking", 422);
    if (competition.lockDeadline && new Date() > competition.lockDeadline) {
      throw new RequestError("Lock deadline has passed", 403);
    }

    const locked = await repo.entries.save({
      ...entry,
      locked: true,
      lockedAt: entry.lockedAt ?? new Date()
    });

    return json({ entry: locked });
  } catch (error) {
    return handleApiError(error);
  }
}
