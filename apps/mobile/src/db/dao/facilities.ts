import { getDb, tx } from "../client.ts";
import { rankFacilities, assessFreshness } from "@swasthyasetu/core";
import type { RankedFacility, CapabilityRequirement, UrgencyTier } from "@swasthyasetu/core";

export interface FacilityRow {
  facilityId: string;
  name: string;
  type: string;
  districtCode: string;
  lat: number;
  lon: number;
  capabilityTags: string[];
  phone: string | null;
  lastConfirmedAt: string | null;
  capabilityLevel: number;
  lastNegativeAt: string | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function replaceCache(facilities: FacilityRow[], villages: unknown[], travelTimes: unknown[]): void {
  tx((db) => {
    db.runSync("DELETE FROM facilities_cache");
    db.runSync("DELETE FROM villages_cache");
    db.runSync("DELETE FROM travel_times_cache");

    for (const f of facilities) {
      db.runSync(
        "INSERT OR REPLACE INTO facilities_cache (facility_id, name, type, district_code, lat, lon, capability_level, capability_tags, phone, last_confirmed_at, last_negative_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [f.facilityId, f.name, f.type, f.districtCode, f.lat, f.lon, f.capabilityLevel, f.capabilityTags.join(","), f.phone ?? null, f.lastConfirmedAt ?? null, f.lastNegativeAt ?? null, new Date().toISOString()],
      );
    }

    for (const v of villages as Array<{ villageId: string; name: string; districtCode: string; latitude: number; longitude: number }>) {
      db.runSync(
        "INSERT OR REPLACE INTO villages_cache (village_id, name, district_code, lat, lon) VALUES (?,?,?,?,?)",
        [v.villageId, v.name, v.districtCode, v.latitude, v.longitude],
      );
    }

    for (const t of travelTimes as Array<{ villageId: string; facilityId: string; travelSeconds: number; distanceMeters: number; source: string }>) {
      db.runSync(
        "INSERT OR REPLACE INTO travel_times_cache (village_id, facility_id, travel_seconds, distance_meters, source) VALUES (?,?,?,?,?)",
        [t.villageId, t.facilityId, t.travelSeconds, t.distanceMeters, t.source],
      );
    }

    db.runSync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync.lastPullAt', ?)", [new Date().toISOString()]);
  });
}

export function candidates(near: { lat: number; lon: number }, radiusKm: number): FacilityRow[] {
  const all = getDb().getAllSync("SELECT * FROM facilities_cache") as Array<{
    facility_id: string; name: string; type: string; district_code: string;
    lat: number; lon: number; capability_level: number; capability_tags: string;
    phone: string | null; last_confirmed_at: string | null; last_negative_at: string | null;
  }>;
  return all
    .filter((f) => haversineKm(near.lat, near.lon, f.lat, f.lon) <= radiusKm)
    .sort((a, b) => haversineKm(near.lat, near.lon, a.lat, a.lon) - haversineKm(near.lat, near.lon, b.lat, b.lon))
    .slice(0, 40)
    .map((f) => ({
      facilityId: f.facility_id, name: f.name, type: f.type, districtCode: f.district_code,
      lat: f.lat, lon: f.lon, capabilityLevel: f.capability_level,
      capabilityTags: f.capability_tags ? f.capability_tags.split(",") : [],
      phone: f.phone, lastConfirmedAt: f.last_confirmed_at, lastNegativeAt: f.last_negative_at,
    }));
}

export function travelMinutes(villageId: string, facilityId: string): number | null {
  const row = getDb().getFirstSync(
    "SELECT travel_seconds FROM travel_times_cache WHERE village_id=? AND facility_id=?",
    [villageId, facilityId],
  ) as { travel_seconds: number } | null;
  return row ? Math.round(row.travel_seconds / 60) : null;
}

export function rankOffline(input: { near: { lat: number; lon: number }; radiusKm?: number; requirement: CapabilityRequirement; tier: UrgencyTier; villageId?: string }): RankedFacility[] {
  const facs = candidates(input.near, input.radiusKm ?? 25);
  const candidates2 = facs.map((f) => {
    const tt = input.villageId
      ? (getDb().getFirstSync("SELECT travel_seconds, distance_meters, source FROM travel_times_cache WHERE village_id=? AND facility_id=?", [input.villageId, f.facilityId]) as { travel_seconds: number; distance_meters: number; source: string } | null)
      : null;
    const dist = haversineKm(input.near.lat, input.near.lon, f.lat, f.lon);
    return {
      facilityId: f.facilityId, name: f.name, facilityType: f.type,
      capabilityLevel: f.capabilityLevel as 1|2|3|4|5,
      capabilityTags: f.capabilityTags,
      travelSeconds: tt?.travel_seconds ?? Math.round(dist * 1000 / (25 * 1000 / 3600) * 1.4),
      distanceMeters: tt?.distance_meters ?? Math.round(dist * 1000),
      travelSource: (tt?.source ?? "ESTIMATED") as "OSRM" | "ESTIMATED",
      lastConfirmedAt: f.lastConfirmedAt,
      lastNegativeAt: f.lastNegativeAt,
      latitude: f.lat, longitude: f.lon, phone: f.phone,
    };
  });
  return rankFacilities(candidates2, input.requirement, input.tier, new Date().toISOString()).results;
}

export function lastSyncedAt(): string | null {
  const row = getDb().getFirstSync("SELECT value FROM app_meta WHERE key='sync.lastPullAt'") as { value: string } | null;
  return row?.value ?? null;
}