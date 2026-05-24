import { handleApiError, json, requireUser, resolveCompetition } from "@/server/api/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await requireUser();
    const { slug } = await context.params;
    const { repo, competition } = await resolveCompetition(slug);
    return json({ fixtures: await repo.fixtures.list(competition.id) });
  } catch (error) {
    return handleApiError(error);
  }
}
