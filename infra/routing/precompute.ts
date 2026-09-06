/**
 * FILE: infra/routing/precompute.ts
 * STATUS: IMPLEMENTED - PHASE 5
 */
import pg from "pg";
import url from "node:url";

export const RURAL_SPEED_KMPH = 25;
export const DETOUR_FACTOR = 1.4;

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error("Missing: " + key);
  return v;
}

export async function fillEstimatedGaps(client: pg.PoolClient, districtCode: string): Promise<number> {
  const res = await client.query(`
    WITH pairs AS (
      SELECT v.village_id, f.facility_id,
             ST_Distance(v.centroid, f.geom)::double precision AS meters
        FROM villages v
        JOIN facilities f ON f.district_code = v.district_code
       WHERE v.district_code = $1
    )
    INSERT INTO travel_times (village_id, facility_id, travel_seconds, distance_meters, source)
    SELECT p.village_id, p.facility_id,
      ROUND(p.meters / ($2::double precision * 1000.0 / 3600.0) * $3)::integer,
      ROUND(p.meters)::integer,
      'ESTIMATED'
    FROM pairs p
    WHERE NOT EXISTS (
      SELECT 1 FROM travel_times t
       WHERE t.village_id = p.village_id AND t.facility_id = p.facility_id
    )
    ON CONFLICT (village_id, facility_id) DO NOTHING
    RETURNING village_id
  `, [districtCode, RURAL_SPEED_KMPH, DETOUR_FACTOR]);
  return res.rowCount ?? 0;
}

export async function precomputeTravelTimes() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const districtCode = process.env["DEMO_DISTRICT_CODE"] ?? "227";
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  const client = await pool.connect();
  const t0 = Date.now();
  try {
    const vilRes = await client.query(
      "SELECT village_id, ST_Y(centroid::geometry) AS lat, ST_X(centroid::geometry) AS lon FROM villages WHERE district_code = $1",
      [districtCode]);
    const facRes = await client.query(
      "SELECT facility_id FROM facilities WHERE district_code = $1",
      [districtCode]);
    const totalPairs = vilRes.rows.length * facRes.rows.length;
    if (totalPairs === 0) throw new Error("No village/facility pairs in the selected district. Seed that district first.");
    console.log("Pairs to fill: " + totalPairs);
    const estimated = await fillEstimatedGaps(client, districtCode);
    const ms = Date.now() - t0;
    console.log("Done in " + ms + "ms: " + estimated + " ESTIMATED rows written");
    const missing = await client.query(
      "SELECT count(*)::text AS n FROM villages v JOIN facilities f ON f.district_code=v.district_code WHERE v.district_code=$1 AND NOT EXISTS (SELECT 1 FROM travel_times t WHERE t.village_id=v.village_id AND t.facility_id=f.facility_id)",
      [districtCode]);
    const m = parseInt(missing.rows[0]?.n ?? "0");
    if (m > 0) throw new Error(m + " pairs still missing");
    console.log("All pairs covered");
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === url.pathToFileURL(process.argv[1] ?? "").href) {
  precomputeTravelTimes().catch(err => { console.error(err); process.exit(1); });
}
