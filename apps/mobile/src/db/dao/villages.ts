/** District-scoped villages cached during an ASHA's online sign-in. */
import type { asha as ashaContracts } from "@swasthyasetu/contracts";

import { getDb, tx } from "../client.ts";

export type VillageRow = ReturnType<typeof ashaContracts.village.parse>;

export function replaceVillages(villages: VillageRow[]): void {
  tx((db) => {
    db.runSync("DELETE FROM villages_cache");
    for (const village of villages) {
      db.runSync(
        `INSERT INTO villages_cache (village_id, name, district_code, lat, lon)
         VALUES (?, ?, ?, ?, ?)`,
        [
          village.villageId,
          village.name,
          village.districtCode,
          village.latitude,
          village.longitude,
        ],
      );
    }
    db.runSync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('villages.lastRefreshAt', ?)",
      [new Date().toISOString()],
    );
  });
}

export function listVillages(districtCode?: string): VillageRow[] {
  const rows = getDb().getAllSync(
    `SELECT village_id, name, district_code, lat, lon
       FROM villages_cache
      WHERE (? IS NULL OR district_code = ?)
      ORDER BY name`,
    [districtCode ?? null, districtCode ?? null],
  ) as Array<{
    village_id: string;
    name: string;
    district_code: string;
    lat: number;
    lon: number;
  }>;
  return rows.map((row) => ({
    villageId: row.village_id,
    name: row.name,
    districtCode: row.district_code,
    latitude: row.lat,
    longitude: row.lon,
    population: null,
  }));
}
