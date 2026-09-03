/**
 * FILE: apps/api/src/db/migrate.ts
 * PLAN: IMPLEMENTATION_PLAN.md §9.2
 * STATUS: STUB — implement runMigrations
 * PHASE: 0
 *
 * Applies infra/migrations/*.sql in filename order. Run with `npm run db:migrate`.
 *
 * WHY NOT A MIGRATION LIBRARY
 *   Ten files, applied in order, recorded in a table. A library would add a
 *   dependency, a config file and a CLI to learn, in exchange for features this
 *   project will never use (down-migrations, branching, squashing).
 *
 * MAY IMPORT   node:fs, node:path, node:url, pg, ./pool.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT
 *
 *   1. Resolve the migrations directory relative to THIS file, not to cwd:
 *        const here = path.dirname(url.fileURLToPath(import.meta.url));
 *        const dir  = path.resolve(here, "../../../../infra/migrations");
 *      (apps/api/src/db -> repo root -> infra/migrations)
 *      Using cwd breaks the moment someone runs the script from apps/api.
 *
 *   2. Ensure the ledger exists — plain SQL, outside any transaction:
 *        CREATE TABLE IF NOT EXISTS schema_migrations (
 *          filename    text PRIMARY KEY,
 *          applied_at  timestamptz NOT NULL DEFAULT now(),
 *          checksum    text NOT NULL
 *        );
 *
 *   3. List *.sql, sort ASCENDING BY FILENAME. The 001_/002_ prefixes make
 *      lexicographic order the intended order. Do not sort by mtime — git
 *      checkouts scramble mtimes and the schema would apply out of order.
 *
 *   4. For each file:
 *        - read it, compute checksum = sha256 hex of the contents
 *        - SELECT checksum FROM schema_migrations WHERE filename = $1
 *        - already applied AND checksum matches -> skip, log "= 004_... (applied)"
 *        - already applied AND checksum DIFFERS -> THROW. Someone edited a
 *          migration that has already run; the database and the file no longer
 *          agree and silently continuing hides real schema drift. The fix is a
 *          new migration file, never an edit to an old one.
 *        - not applied -> inside withTransaction():
 *              await client.query(sql)
 *              INSERT INTO schema_migrations (filename, checksum) VALUES ($1,$2)
 *          One transaction per FILE, so a failure leaves that file wholly
 *          unapplied rather than half-applied.
 *
 *   5. Log a one-line summary: "migrations: 3 applied, 7 already current".
 *
 *   6. Run it when invoked directly:
 *        if (import.meta.url === url.pathToFileURL(process.argv[1] ?? "").href) {
 *          runMigrations()
 *            .then(() => closePool())
 *            .catch((e) => { console.error(e); process.exit(1); });
 *        }
 *      Exit non-zero on failure or CI will report a broken schema as green.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPECTED FIRST-RUN BLOCKER (see AGENTS.md §7)
 *   001_extensions.sql runs CREATE EXTENSION postgis AND vector. No official
 *   image ships both, which is why infra/Dockerfile.db builds one. If this step
 *   fails, the container is wrong — the migration is fine.
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

import { closePool, pool } from "./pool.ts";
import { withTransaction } from "./tx.ts";

export async function runMigrations(): Promise<void> {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const dir = path.resolve(here, "../../../../infra/migrations");

  // Ensure the ledger exists (outside any transaction — DDL in Postgres auto-commits)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      checksum   text NOT NULL DEFAULT ''
    )
  `);

  // List all .sql files, sorted lexicographically so 001_ < 002_ etc.
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let applied = 0;
  let current = 0;

  for (const filename of files) {
    const sql = await fs.readFile(path.join(dir, filename), "utf8");
    const checksum = createHash("sha256").update(sql, "utf8").digest("hex");

    const existing = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE filename = $1",
      [filename],
    );

    if (existing.rows.length > 0) {
      const stored = existing.rows[0]?.checksum;
      if (stored && stored !== checksum) {
        throw new Error(
          `Migration ${filename} has been modified after being applied.\n` +
          `Stored checksum: ${stored}\n` +
          `Current checksum: ${checksum}\n` +
          `Fix: add a new migration file — never edit an applied one.`,
        );
      }
      console.log(`= ${filename} (already applied)`);
      current++;
      continue;
    }

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
        [filename, checksum],
      );
    });

    console.log(`+ ${filename} (applied)`);
    applied++;
  }

  console.log(`migrations: ${applied} applied, ${current} already current`);
}

// Run directly when invoked as a script
if (import.meta.url === url.pathToFileURL(process.argv[1] ?? "").href) {
  runMigrations()
    .then(() => closePool())
    .catch((e) => { console.error(e); process.exit(1); });
}
