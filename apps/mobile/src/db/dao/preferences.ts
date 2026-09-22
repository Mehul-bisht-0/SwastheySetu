import { getDb } from "../client.ts";
import type { Locale } from "../../i18n/strings.ts";

const LOCALE_KEY = "locale";

export function loadLocalePreference(): Locale | null {
  const row = getDb().getFirstSync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = ?",
    LOCALE_KEY,
  );
  return row?.value === "hi" || row?.value === "mr" || row?.value === "en"
    ? row.value
    : null;
}

export function saveLocalePreference(locale: Locale): void {
  getDb().runSync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    LOCALE_KEY,
    locale,
  );
}
