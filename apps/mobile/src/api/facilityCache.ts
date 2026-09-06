/**
 * FILE: apps/mobile/src/api/facilityCache.ts
 * PLAN: IMPLEMENTATION_PLAN.md §12.7, Phase 7
 * STATUS: COMPLETE — public one-district cache bootstrap for offline ranking.
 *
 * Phase 9 owns authenticated reference-data sync. Until then, the citizen flow
 * primes its facility cache from the already-public Phase 6 nearby endpoint.
 * Only server-provided coordinates and evidence timestamps are stored.
 */
import { facilities as facilityContracts } from "@swasthyasetu/contracts";

import { replaceFacilityCache } from "../db/dao/facilities.ts";
import { api } from "./client.ts";

const DEMO_CENTRE = { latitude: 25.13, longitude: 85.6 } as const;

export async function refreshPublicFacilityCache(): Promise<number> {
  const query = new URLSearchParams({
    latitude: String(DEMO_CENTRE.latitude),
    longitude: String(DEMO_CENTRE.longitude),
    radiusMeters: "25000",
    limit: "50",
  });
  const response = await api.get<unknown>(`/facilities/nearby?${query.toString()}`);
  if (!response.ok || response.data === undefined) return 0;

  const data = facilityContracts.nearbyResponse.parse(response.data);
  if (data.items.length === 0) return 0;

  replaceFacilityCache(data.items.map((item) => ({
    facilityId: item.facilityId,
    name: item.name,
    type: item.facilityType,
    districtCode: item.districtCode,
    lat: item.latitude,
    lon: item.longitude,
    capabilityLevel: item.capabilityLevel,
    capabilityTags: item.capabilityTags,
    phone: item.phone,
    lastConfirmedAt: item.lastConfirmedAt,
    lastNegativeAt: item.lastNegativeAt,
  })));
  return data.items.length;
}
