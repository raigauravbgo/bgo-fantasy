import { handleApiError, json } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";

export async function GET() {
  try {
    const repo = platformRepository();
    const all = await repo.competitions.list();
    return json({ competitions: all.filter((c) => c.status === "active") });
  } catch (error) {
    return handleApiError(error);
  }
}
