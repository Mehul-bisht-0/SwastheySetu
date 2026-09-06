import * as SQLite from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
// Metro bundles schema.sql as an asset (see metro.config.js), so the runtime
// value of this import is an asset id, not the file text.
// @ts-ignore - no declaration exists for .sql modules; Metro emits an asset id here.
import SCHEMA_SQL from "./schema.sql";

let db: SQLiteDatabase | null = null;
let schemaSql: string | null = null;

async function loadSchemaSql(): Promise<string> {
  if (schemaSql != null) return schemaSql;
  const asset = Asset.fromModule(SCHEMA_SQL as number);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error("schema.sql asset has no local file");
  schemaSql = await new File(asset.localUri).text();
  return schemaSql;
}

export function getDb(): SQLiteDatabase {
  if (!db) throw new Error("call initDb() before touching the database");
  return db;
}

export async function initDb(): Promise<void> {
  const sql = await loadSchemaSql();
  db = SQLite.openDatabaseSync("swasthyasetu.db");
  db.execSync(sql);
}

export function tx<T>(fn: (db: SQLiteDatabase) => T): T {
  const database = getDb();
  let result!: T;
  database.withTransactionSync(() => {
    result = fn(database);
  });
  return result;
}

export async function resetDb(): Promise<void> {
  const d = getDb();
  d.execSync(`
    DROP TABLE IF EXISTS signals_local;
    DROP TABLE IF EXISTS travel_times_cache;
    DROP TABLE IF EXISTS villages_cache;
    DROP TABLE IF EXISTS facilities_cache;
    DROP TABLE IF EXISTS household_visits_local;
    DROP TABLE IF EXISTS triage_reports_local;
    DROP TABLE IF EXISTS outbox;
    DROP TABLE IF EXISTS app_meta;
  `);
  d.execSync(await loadSchemaSql());
}
