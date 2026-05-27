import { type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

const schema = z.object({
  status: z.enum(["upcoming", "live", "completed"]).optional(),
  venue: z.string().optional()
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const input = await parseJson(request, schema);
    const repo = platformRepository();
    const fixture = await repo.fixtures.findById(id);
    if (!fixture) throw new RequestError("Fixture not found", 404);
    await repo.fixtures.update(id, input);
    return json({ id, ...input });
  } catch (error) {
    return handleApiError(error);
  }
}
