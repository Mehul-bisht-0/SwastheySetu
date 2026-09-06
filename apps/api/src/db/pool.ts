/**
 * FILE: apps/api/src/db/pool.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.2
 * STATUS: STUB — implement the exports below
 * PHASE: 2
 *
 * One pg.Pool for the process. Nothing else opens a connection.
 *
 * MAY IMPORT   pg, ../config.ts
 * MUST NOT IMPORT  any module under ../modules/ (dependency points one way)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. Create the pool:
 *        import pg from "pg";
 *        export const pool = new pg.Pool({
 *          connectionString: config.DATABASE_URL,
 *          max: config.PGPOOL_MAX,
 *          idleTimeoutMillis: 30_000,
 *          connectionTimeoutMillis: 5_000,
 *        });
 *
 *   2. TYPE PARSER — this one matters. node-postgres returns numeric/decimal as
 *      a STRING by default (to avoid float precision loss). classifier_score is
 *      numeric(6,3), so without this it arrives as "12.300" and every comparison
 *      against a number silently fails:
 *        pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
 *      1700 is the OID for numeric. int8 (OID 20) is deliberately LEFT as a
 *      string — row counts can exceed Number.MAX_SAFE_INTEGER and we would
 *      rather see a string than a wrong number.
 *
 *   3. export async function query<T>(sql: string, params?: unknown[]):
 *        return (await pool.query(sql, params)).rows as T[]
 *      This is the ONLY place `pool.query` is called outside a transaction.
 *
 *   4. export async function healthCheck(): Promise<boolean>
 *        run `SELECT 1`, return true; catch and return false.
 *        Never throw — /health must answer even when the database is down.
 *
 *   5. export async function closePool(): Promise<void>  ->  await pool.end()
 *      Called from server.ts on SIGTERM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER build SQL by string interpolation. Every value is a $1, $2 placeholder.
 * `WHERE district = '${code}'` is an injection; `WHERE district = $1` is not.
 * There are no exceptions to this, including for "internal" values.
 */

import pg from "pg";
import { config } from "../config.ts";

// Parse numeric/decimal OID (1700) as a JS Number, not a string.
// Without this, classifier_score comes back as "12.300" and comparisons silently fail.
pg.types.setTypeParser(1700, (v: string | null) => (v === null ? null : Number(v)));
// int8 (OID 20) is intentionally left as string — row counts can exceed MAX_SAFE_INTEGER.

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.PGPOOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: config.NODE_ENV === "test",
});

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  return (await pool.query(sql, params)).rows as T[];
}

export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
