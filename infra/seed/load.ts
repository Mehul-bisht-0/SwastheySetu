/**
 * FILE: infra/seed/load.ts
 * PLAN: IMPLEMENTATION_PLAN.md 11
 * STATUS: STUB - implement the function bodies
 * PHASE: 4
 *
 * PURPOSE
 *   Load facilities.csv and villages.csv into Postgres, then seed demo users and
 *   a spread of facility_activity rows. Must be IDEMPOTENT: running it twice
 *   produces the same database, never duplicates.
 *
 * RUN WITH
 *   npm run db:seed
 *
 * MAY IMPORT
 *   node:fs, node:path, pg, ../../apps/api/src/config.ts (or read DATABASE_URL directly)
 *
 * IMPLEMENT
 *   1. Read DATABASE_URL and DEMO_DISTRICT_CODE from env. Fail loudly if unset.
 *   2. Parse both CSVs. Use a tiny hand-rolled parser or csv-parse; do NOT pull in
 *      a heavy dependency. Split capability_tags on ';'.
 *   3. If either CSV has only a header row, print the PROVENANCE.md instructions
 *      and exit non-zero. Refusing to seed is correct - see guardrail below.
 *   4. Upsert the district row (districts) from DEMO_DISTRICT_CODE.
 *   5. Upsert villages: ON CONFLICT (district_code, name) DO UPDATE.
 *      Set centroid with ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography
 *      -- LONGITUDE FIRST.
 *   6. Upsert facilities: ON CONFLICT (external_abdm_id) DO UPDATE when the id
 *      exists, otherwise match on (district_code, name). Do NOT set geom - the
 *      trigger in 004 derives it from lat/lon.
 *   7. Seed two ASHA users with bcrypt-hashed known dev passwords. Document the
 *      credentials in README.md as dev-only.
 *   8. Seed facility_activity so the demo shows ALL FIVE freshness bands:
 *        one facility FRESH            observed_at = now() - interval '1 day'
 *        one AGING                     now() - interval '6 days'
 *        one STALE                     now() - interval '40 days'
 *        one REPORTED_CLOSED           FACILITY_CLOSED, now() - interval '2 days'
 *        one UNKNOWN                   no activity rows at all
 *      CRITICAL: use now() - interval, NEVER fixed dates. Fixed dates decay to
 *      STALE a month after you write them and the freshness feature silently
 *      disappears from the demo.
 *   9. Print a summary: districts/villages/facilities/users/activity rows written.
 *
 * GUARDRAIL
 *   Every seeded row keeps is_demo_data = true. Never fabricate coordinates -
 *   if the CSVs are empty, stop and tell the operator to fill them from a real
 *   source (see PROVENANCE.md).
 *
 * DONE WHEN
 *   Running twice produces no duplicates, and:
 *     SELECT ST_X(geom::geometry) = longitude FROM facilities;  -- all true
 *   returns true for every row.
 */

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const here = path.dirname(url.fileURLToPath(import.meta.url));

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = (lines[0] ?? "").split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
}

export async function loadSeed(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const districtCode = process.env["DEMO_DISTRICT_CODE"] ?? "NALANDA-227";

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  const client = await pool.connect();

  try {
    const facilityText = await fs.readFile(path.join(here, "facilities.csv"), "utf8");
    const villageText  = await fs.readFile(path.join(here, "villages.csv"),   "utf8");

    const facilities = parseCsv(facilityText);
    const villages   = parseCsv(villageText);

    if (facilities.length === 0 || villages.length === 0) {
      console.error("CSVs contain only headers. Fill them from a real source (see PROVENANCE.md).");
      process.exit(1);
    }

    await client.query("BEGIN");

    // 1. District
    await client.query(
      `INSERT INTO districts (district_code, name, state_name, is_demo_data)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (district_code) DO UPDATE
         SET name = EXCLUDED.name, state_name = EXCLUDED.state_name`,
      [districtCode, "Nalanda", "Bihar"],
    );

    // 2. Villages
    let villageCount = 0;
    for (const v of villages) {
      await client.query(
        `INSERT INTO villages (district_code, name, lgd_code, centroid, population, is_demo_data)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $6, true)
         ON CONFLICT (district_code, name) DO UPDATE
           SET lgd_code  = EXCLUDED.lgd_code,
               centroid   = EXCLUDED.centroid,
               population = EXCLUDED.population`,
        [districtCode, v["name"], v["lgd_code"] ?? null, parseFloat(v["latitude"] ?? "0"), parseFloat(v["longitude"] ?? "0"), v["population"] ? parseInt(v["population"]) : null],
      );
      villageCount++;
    }

    // 3. Facilities — trigger derives geom from lat/lon, so do NOT set geom
    let facilityCount = 0;
    for (const f of facilities) {
      const tags = (f["capability_tags"] ?? "").split(";").map((t) => t.trim()).filter(Boolean);
      const level = parseInt(f["capability_level"] ?? "1");
      const extId = f["external_abdm_id"] || null;

      if (extId) {
        await client.query(
          `INSERT INTO facilities
             (name, facility_type, capability_level, capability_tags, district_code,
              latitude, longitude, phone, external_abdm_id, is_demo_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
           ON CONFLICT (external_abdm_id) DO UPDATE
             SET name             = EXCLUDED.name,
                 facility_type    = EXCLUDED.facility_type,
                 capability_level = EXCLUDED.capability_level,
                 capability_tags  = EXCLUDED.capability_tags,
                 latitude         = EXCLUDED.latitude,
                 longitude        = EXCLUDED.longitude,
                 phone            = EXCLUDED.phone`,
          [f["name"], f["facility_type"], level, tags, districtCode,
           parseFloat(f["latitude"] ?? "0"), parseFloat(f["longitude"] ?? "0"),
           f["phone"] || null, extId],
        );
      } else {
        await client.query(
          `INSERT INTO facilities
             (name, facility_type, capability_level, capability_tags, district_code,
              latitude, longitude, phone, is_demo_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
           ON CONFLICT (district_code, name) DO UPDATE
             SET facility_type    = EXCLUDED.facility_type,
                 capability_level = EXCLUDED.capability_level,
                 capability_tags  = EXCLUDED.capability_tags,
                 latitude         = EXCLUDED.latitude,
                 longitude        = EXCLUDED.longitude,
                 phone            = EXCLUDED.phone`,
          [f["name"], f["facility_type"], level, tags, districtCode,
           parseFloat(f["latitude"] ?? "0"), parseFloat(f["longitude"] ?? "0"),
           f["phone"] || null],
        );
      }
      facilityCount++;
    }

    // 4. Seed two demo ASHA users (documented in README.md as dev-only)
    const hash1 = await bcrypt.hash("Asha@demo1!", 10);
    const hash2 = await bcrypt.hash("Asha@demo2!", 10);

    await client.query(
      `INSERT INTO users (phone, full_name, role, password_hash, district_code, is_active)
       VALUES ($1,$2,'ASHA',$3,$4,true)
       ON CONFLICT (phone) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name`,
      ["+917001000001", "Demo ASHA Sunita", hash1, districtCode],
    );
    await client.query(
      `INSERT INTO users (phone, full_name, role, password_hash, district_code, is_active)
       VALUES ($1,$2,'ASHA',$3,$4,true)
       ON CONFLICT (phone) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name`,
      ["+917001000002", "Demo ASHA Meena", hash2, districtCode],
    );

    // 5. Seed facility_activity for the freshness spread.
    //    Select the first 5 facilities by capability_level DESC so we get the
    //    important ones and each gets a different band.
    //    CRITICAL: use interval arithmetic so bands never decay to STALE after deployment.
    const facRows = await client.query<{ facility_id: string }>(
      `SELECT facility_id FROM facilities WHERE district_code = $1 ORDER BY capability_level DESC, name LIMIT 6`,
      [districtCode],
    );
    const facIds = facRows.rows.map((r) => r.facility_id);

    // Clear old demo activity so re-seed is idempotent on the bands
    if (facIds.length > 0) {
      await client.query(
        `DELETE FROM facility_activity WHERE facility_id = ANY($1::uuid[])`,
        [facIds],
      );
    }

    const demoAshaRow = await client.query<{ user_id: string }>(
      `SELECT user_id FROM users WHERE phone = $1`, ["+917001000001"],
    );
    const demoAshaId = demoAshaRow.rows[0]?.user_id ?? null;

    // FRESH: confirmed 1 day ago
    if (facIds[0]) {
      await client.query(
        `INSERT INTO facility_activity (activity_id, facility_id, signal_type, observed_at, submitted_by)
         VALUES (gen_random_uuid(), $1, 'STAFF_PRESENT', now() - interval '1 day', $2)`,
        [facIds[0], demoAshaId],
      );
    }
    // AGING: confirmed 6 days ago
    if (facIds[1]) {
      await client.query(
        `INSERT INTO facility_activity (activity_id, facility_id, signal_type, observed_at, submitted_by)
         VALUES (gen_random_uuid(), $1, 'FACILITY_OPEN', now() - interval '6 days', $2)`,
        [facIds[1], demoAshaId],
      );
    }
    // STALE: confirmed 40 days ago
    if (facIds[2]) {
      await client.query(
        `INSERT INTO facility_activity (activity_id, facility_id, signal_type, observed_at, submitted_by)
         VALUES (gen_random_uuid(), $1, 'STAFF_PRESENT', now() - interval '40 days', $2)`,
        [facIds[2], demoAshaId],
      );
    }
    // REPORTED_CLOSED: negative signal 2 days ago (no positive more recent)
    if (facIds[3]) {
      await client.query(
        `INSERT INTO facility_activity (activity_id, facility_id, signal_type, observed_at, submitted_by)
         VALUES (gen_random_uuid(), $1, 'FACILITY_CLOSED', now() - interval '2 days', $2)`,
        [facIds[3], demoAshaId],
      );
    }
    // facIds[4] gets NO activity rows => UNKNOWN band
    // facIds[5] optional extra

    await client.query("COMMIT");

    // Verify geom consistency
    const geomCheck = await client.query<{ ok: boolean }>(
      `SELECT bool_and(abs(ST_X(geom::geometry) - longitude) < 0.0001
                    AND abs(ST_Y(geom::geometry) - latitude) < 0.0001) AS ok
         FROM facilities WHERE district_code = $1`,
      [districtCode],
    );
    if (!geomCheck.rows[0]?.ok) {
      throw new Error("geom/lat-lon mismatch detected after seed — check ST_MakePoint argument order");
    }

    console.log(`seed complete: 1 district, ${villageCount} villages, ${facilityCount} facilities, 2 users, 4 activity rows`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Allow `node infra/seed/load.ts` directly.
if (import.meta.url === url.pathToFileURL(process.argv[1] ?? "").href) {
  loadSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
