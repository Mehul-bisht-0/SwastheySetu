import * as SQLite from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
// @ts-ignore - sql file imported as string via Metro
import SCHEMA_SQL from "./schema.sql";

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) throw new Error("call initDb() before touching the database");
  return db;
}

export async function initDb(): Promise<void> {
  db = SQLite.openDatabaseSync("swasthyasetu.db");
  db.execSync(SCHEMA_SQL as string);
}

export function tx<T>(fn: (db: SQLiteDatabase) => T): T {
  return getDb().withTransactionSync(() => fn(getDb()));
}

export function resetDb(): void {
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
  d.execSync(SCHEMA_SQL as string);
}
