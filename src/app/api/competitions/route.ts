import { handleApiError, json } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

export async function GET() {
  try {
    const repo = platformRepository();
    return json({ competitions: await repo.competitions.list() });
  } catch (error) {
    return handleApiError(error);
  }
}
