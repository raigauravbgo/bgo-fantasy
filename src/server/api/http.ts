import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

import { platformRepository } from "@/server/repositories/platform";
import { usersRepository } from "@/server/repositories/users";
import {
  assertAdmin,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from "@/server/auth/session";
import type { SessionUser } from "@/server/auth/types";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorJson(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function parseJson<T>(request: NextRequest, schema: ZodType<T>) {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RequestError("Invalid request body", 422, error.issues);
    }
    throw error;
  }
}

export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof RequestError) {
    return errorJson(error.message, error.status, error.details);
  }

  if (error instanceof Error) {
    return errorJson(error.message, 500);
  }

  return errorJson("Unknown error", 500);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new RequestError("Authentication required", 401);
  }
  return user;
}

export async function requireAdminUser(): Promise<SessionUser> {
  const user = await requireUser();
  try {
    assertAdmin(user);
  } catch {
    throw new RequestError("Admin role required", 403);
  }
  return user;
}

export async function resolveCompetition(slug: string) {
  const repo = platformRepository();
  const competition = await repo.competitions.findBySlug(slug);

  if (!competition) {
    throw new RequestError("Competition not found", 404);
  }

  return { repo, competition };
}

export async function getUserRecord(userId: string) {
  return usersRepository().findById(userId);
}
