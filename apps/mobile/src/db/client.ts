import * as SQLite from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
// Metro bundles schema.sql as an asset (see metro.config.js), so the runtime
// value of this import is an asset id, not the file text.
// @ts-ignore - no declaration exists for .sql modules; Metro emits an asset id here.
import SCHEMA_SQL from "./schema.sql";
// @ts-ignore - bundled as an asset in the same way as the immutable base schema.
import CONNECTIVITY_SQL from "./connectivity.sql";

let db: SQLiteDatabase | null = null;
let schemaSql: string | null = null;
let connectivitySql: string | null = null;

async function loadSchemaSql(): Promise<string> {
  if (schemaSql != null) return schemaSql;
  const asset = Asset.fromModule(SCHEMA_SQL as number);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error("schema.sql asset has no local file");
  schemaSql = await new File(asset.localUri).text();
  return schemaSql;
}

async function loadConnectivitySql(): Promise<string> {
  if (connectivitySql != null) return connectivitySql;
  const asset = Asset.fromModule(CONNECTIVITY_SQL as number);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error("connectivity.sql asset has no local file");
  connectivitySql = await new File(asset.localUri).text();
  return connectivitySql;
}

export function getDb(): SQLiteDatabase {
  if (!db) throw new Error("call initDb() before touching the database");
  return db;
}

export async function initDb(): Promise<void> {
  const [sql, extension] = await Promise.all([loadSchemaSql(), loadConnectivitySql()]);
  db = SQLite.openDatabaseSync("swasthyasetu.db");
  db.execSync(sql);
  db.execSync(extension);
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
    DROP TABLE IF EXISTS diagnostic_signal_outbox;
    DROP TABLE IF EXISTS diagnostic_reference_cache;
    DROP TABLE IF EXISTS patient_operation_outbox;
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
  d.execSync(await loadConnectivitySql());
}
