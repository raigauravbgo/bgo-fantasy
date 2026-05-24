import { describe, expect, it } from "vitest";

import {
  assertAdmin,
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from "./session";

const secret = "test-secret-that-is-long-enough-for-session-tests";

describe("session", () => {
  it("uses the isolated BGO Games cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("bgo_games_session");
  });

  it("round-trips a signed session token", async () => {
    const token = await createSessionToken(
      { id: "user-1", email: "user@example.com", role: "admin" },
      secret
    );

    await expect(verifySessionToken(token, secret)).resolves.toEqual({
      id: "user-1",
      email: "user@example.com",
      role: "admin"
    });
  });

  it("rejects player role for admin actions", () => {
    expect(() =>
      assertAdmin({ id: "user-1", email: "user@example.com", role: "player" })
    ).toThrow(/Admin role required/);
  });
});
