import { z } from "zod";

const DEFAULT_SESSION_COOKIE_NAME = "bgo_games_session";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  SESSION_COOKIE_NAME: z.string().min(1).default(DEFAULT_SESSION_COOKIE_NAME)
});

export type AppEnv = z.infer<typeof envSchema>;
export type EnvSource = Record<string, string | undefined>;

export function parseEnv(source: EnvSource): AppEnv {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = parsed.data;

  if (
    env.NODE_ENV === "production" &&
    env.JWT_SECRET === "replace-with-a-long-random-secret"
  ) {
    throw new Error("JWT_SECRET must be changed for production");
  }

  const LEGACY_SESSION_COOKIE = "bgo_ipl_session";
  if (env.SESSION_COOKIE_NAME === LEGACY_SESSION_COOKIE) {
    throw new Error(
      `SESSION_COOKIE_NAME must not be the legacy IPL cookie name: ${LEGACY_SESSION_COOKIE}`
    );
  }

  return env;
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

export function resetEnvCacheForTests(): void {
  cachedEnv = undefined;
}
