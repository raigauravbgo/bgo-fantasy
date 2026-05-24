import { type NextRequest } from "next/server";
import { z } from "zod";

import { getEnv } from "@/config/env";
import { hashPassword } from "@/server/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import {
  errorJson,
  handleApiError,
  json,
  parseJson,
  RequestError
} from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { usersRepository } from "@/server/repositories/users";

const schema = z.object({
  name: z.string().min(2),
  email: z.email(),
  employeeId: z.string().optional(),
  password: z.string().min(8)
});

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, schema);
    const platform = platformRepository();
    const competitions = await platform.competitions.list();
    const active = competitions.find((competition) => competition.status === "active");

    if (active && !active.registrationOpen) {
      return errorJson("Registration is closed", 403);
    }

    const users = usersRepository();
    const existing = await users.findByEmail(input.email);
    if (existing) {
      throw new RequestError("Email is already registered", 409);
    }

    const user = await users.create({
      name: input.name,
      email: input.email,
      employeeId: input.employeeId,
      passwordHash: await hashPassword(input.password),
      role: "player"
    });

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    const response = json({ user: sanitizeUser(user) }, 201);
    response.cookies.set(SESSION_COOKIE_NAME, token, cookieOptions());
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

function sanitizeUser(user: { id: string; name: string; email: string; role: string }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function cookieOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  };
}
