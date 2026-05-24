import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

const validEnv = {
  NODE_ENV: "development",
  APP_ENV: "development",
  APP_URL: "http://localhost:3000",
  MONGODB_URI: "mongodb://localhost:27017",
  MONGODB_DB_NAME: "bgo_games_dev",
  JWT_SECRET: "local-secret-with-enough-entropy",
  SESSION_COOKIE_NAME: "bgo_games_session"
};

describe("parseEnv", () => {
  it("accepts the dedicated BGO Games database and session cookie", () => {
    expect(parseEnv(validEnv)).toMatchObject({
      MONGODB_DB_NAME: "bgo_games_dev",
      SESSION_COOKIE_NAME: "bgo_games_session"
    });
  });

  it("requires a MongoDB database name", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        MONGODB_DB_NAME: ""
      })
    ).toThrow(/MONGODB_DB_NAME is required/);
  });

  it("blocks the legacy IPL database name", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        MONGODB_DB_NAME: "bgo_fantasy"
      })
    ).toThrow(/Blocked unsafe MongoDB database name: bgo_fantasy/);
  });

  it("requires the new session cookie name", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        SESSION_COOKIE_NAME: "bgo_fantasy_session"
      })
    ).toThrow(/SESSION_COOKIE_NAME must be bgo_games_session/);
  });

  it("rejects the placeholder JWT secret in production", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: "production",
        APP_ENV: "production",
        JWT_SECRET: "replace-with-a-long-random-secret"
      })
    ).toThrow(/JWT_SECRET must be changed for production/);
  });
});
