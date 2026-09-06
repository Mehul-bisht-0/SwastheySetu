/** Stable installation identity; never a phone number or hardware identifier. */
import { getDb } from "../db/client.ts";

export function getDeviceId(): string {
  const db = getDb();
  db.runSync("INSERT OR IGNORE INTO app_meta(key,value) VALUES ('device.id', lower(hex(randomblob(16))))");
  return db.getFirstSync<{ value: string }>("SELECT value FROM app_meta WHERE key='device.id'")!.value;
}
