import { type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, json, parseJson, RequestError, getSessionUser } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";
import { newId } from "@/server/db/collection";

const schema = z.object({
  description: z.string().min(5).max(2000),
  pageUrl: z.string().optional(),
  screenshotData: z.string().optional() // base64 data URL
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) throw new RequestError("Sign in required", 401);

    const input = await parseJson(request, schema);

    // Reject suspiciously large screenshots (> 3 MB base64 ≈ ~2.25 MB raw)
    if (input.screenshotData && input.screenshotData.length > 3_000_000) {
      throw new RequestError("Screenshot too large (max ~2 MB)", 413);
    }

    const report = await prisma.bugReport.create({
      data: {
        id: newId(),
        userId: session.id,
        description: input.description,
        pageUrl: input.pageUrl ?? null,
        screenshotData: input.screenshotData ?? null,
        status: "open"
      }
    });

    return json({ id: report.id }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
