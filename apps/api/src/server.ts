/**
 * FILE: apps/api/src/server.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.1
 * STATUS: STUB — implement main()
 * PHASE: 2
 *
 * Process entry point: build, listen, shut down cleanly. Nothing else.
 *
 * MAY IMPORT   ./app.ts, ./config.ts, ./db/pool.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   async function main() {
 *     const app = await buildApp();
 *     await app.listen({ port: config.PORT, host: config.HOST });
 *
 *     for (const signal of ["SIGTERM", "SIGINT"] as const) {
 *       process.once(signal, async () => {
 *         app.log.info({ signal }, "shutting down");
 *         await app.close();     // stops accepting, drains in-flight requests
 *         await closePool();     // then release DB connections
 *         process.exit(0);
 *       });
 *     }
 *   }
 *
 *   main().catch((err) => {
 *     console.error(err);        // the logger may not exist yet — use console
 *     process.exit(1);
 *   });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTES
 *
 *   HOST must be 0.0.0.0, not 127.0.0.1. A phone on the same wifi cannot reach
 *   a loopback-bound server, and "works in curl, not on the device" costs an
 *   hour to diagnose every single time.
 *
 *   Order on shutdown is app.close() THEN closePool(). Reversed, an in-flight
 *   request loses its connection mid-query and the client sees a 500 instead of
 *   a completed write — which, for a queued offline write, means a retry loop.
 *
 *   The database is NOT required to boot. /health reports database: "down" and
 *   the process stays up, so a judge sees a running API with a clear diagnostic
 *   rather than a crash loop with no explanation.
 */

import { buildApp } from "./app.ts";
import { config } from "./config.ts";
import { closePool } from "./db/pool.ts";

async function main(): Promise<void> {
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: config.HOST });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, async () => {
      app.log.info({ signal }, "shutting down");
      await app.close();
      await closePool();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
