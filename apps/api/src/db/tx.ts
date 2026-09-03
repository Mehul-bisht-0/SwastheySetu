/**
 * FILE: apps/api/src/db/tx.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.2
 * STATUS: STUB — implement withTransaction
 * PHASE: 2
 *
 * MAY IMPORT   pg, ./pool.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   export async function withTransaction<T>(
 *     fn: (client: pg.PoolClient) => Promise<T>,
 *   ): Promise<T>
 *
 *     const client = await pool.connect();
 *     try {
 *       await client.query("BEGIN");
 *       const out = await fn(client);
 *       await client.query("COMMIT");
 *       return out;
 *     } catch (err) {
 *       await client.query("ROLLBACK");   // wrap in its own try/catch: if the
 *                                         // connection already died, ROLLBACK
 *                                         // throws and would mask the REAL error
 *       throw err;
 *     } finally {
 *       client.release();                 // MUST be in `finally`. A missed
 *                                         // release leaks a connection, and ten
 *                                         // leaks exhaust the pool — the API
 *                                         // then hangs instead of erroring,
 *                                         // which is much harder to diagnose
 *                                         // mid-demo.
 *     }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE TRANSACTIONS ARE ACTUALLY NEEDED
 *
 *   sync/push  — ONE TRANSACTION PER OPERATION, not one for the batch.
 *                Each queued write must succeed or fail alone; see the note at
 *                the top of packages/contracts/src/sync.ts. Wrapping the batch
 *                would let one bad row reject 99 good ones forever.
 *
 *   Everything else in v1 is a single statement and needs no transaction.
 *   Do not wrap reads.
 */

import type pg from "pg";
import { pool } from "./pool.ts";

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback error, surface original */ }
    throw err;
  } finally {
    client.release();
  }
}
