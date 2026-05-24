import { jwtVerify, SignJWT } from "jose";

import { getEnv } from "@/config/env";
import type { SessionUser } from "@/server/auth/types";

export const SESSION_COOKIE_NAME = "bgo_games_session";

type SessionPayload = SessionUser & {
  iat?: number;
  exp?: number;
};

function getJwtSecret(secret = getEnv().JWT_SECRET): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  user: SessionUser,
  secret?: string
): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret(secret));
}

export async function verifySessionToken(
  token: string,
  secret?: string
): Promise<SessionUser> {
  const verified = await jwtVerify<SessionPayload>(token, getJwtSecret(secret));

  if (!verified.payload.sub) {
    throw new Error("Session token is missing subject");
  }

  return {
    id: verified.payload.sub,
    email: verified.payload.email,
    role: verified.payload.role
  };
}

export function assertAdmin(user: SessionUser): void {
  if (user.role !== "admin" && user.role !== "super_admin") {
    throw new Error("Admin role required");
  }
}
