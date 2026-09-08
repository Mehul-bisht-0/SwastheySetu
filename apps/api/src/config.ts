/**
 * FILE: apps/api/src/config.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.1
 * STATUS: COMPLETE — do not modify
 *
 * Environment parsing, done once, at startup, and loudly.
 *
 * WHY IT THROWS INSTEAD OF DEFAULTING
 *   A missing JWT_SECRET that silently defaults to "dev" is a production
 *   incident waiting to happen. Failing at boot is loud, immediate, and happens
 *   on the developer's machine rather than the judge's.
 */

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().url(),
  PGPOOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

  /**
   * No default, minimum 32 chars. In dev, copy .env.example and generate one
   * with:  node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
   */
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("30d"),

  /** Comma-separated. The Expo dev client needs its LAN origin listed here. */
  CORS_ORIGINS: z.string().default("*"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  /** Development uses a no-document mock; production must integrate an authorised provider. */
  IDENTITY_PROVIDER_MODE: z.enum(["mock", "external"]).default("mock"),

  /** ABDM HIU/Consent Manager integration is simulated only outside production. */
  ABDM_MODE: z.enum(["mock", "external"]).default("mock"),

  /**
   * MUST STAY false FOR v1. /rag/ask returns 501 and /health reports
   * ragEnabled: false, which is what makes the mobile app hide the entry point.
   * Flipping this without building the backend produces a demo that claims a
   * capability it does not have.
   */
  RAG_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  /** Only used by infra/routing/precompute.ts, never at request time. */
  OSRM_URL: z.string().url().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && value.IDENTITY_PROVIDER_MODE === "mock") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["IDENTITY_PROVIDER_MODE"],
      message: "must be external in production",
    });
  }
  if (value.NODE_ENV === "production" && value.ABDM_MODE === "mock") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ABDM_MODE"],
      message: "must be external in production",
    });
  }
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment.\n${detail}\n\nSee .env.example.`);
  }
  return parsed.data;
}

export const config = load();

export const isProd = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";

/** Surfaced by /health so a bug report can name the exact build. */
export const APP_VERSION = "0.1.0";
