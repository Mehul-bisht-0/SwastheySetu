import { query } from "../../db/pool.ts";

export interface ProviderLoginRow {
  provider_account_id: string;
  practitioner_id: string;
  phone: string;
  password_hash: string;
  account_active: boolean;
  practitioner_active: boolean;
  hpr_id: string;
  full_name: string;
  qualification: string;
  specialty: string;
}

export interface ProviderFacilityRow {
  facility_id: string;
  facility_name: string;
  hfr_id: string | null;
  district_code: string;
  role: "DOCTOR" | "NURSE" | "LAB_TECH" | "RECORDS_OFFICER" | "FACILITY_ADMIN";
}

export interface ProviderActor extends ProviderFacilityRow {
  provider_account_id: string;
  practitioner_id: string;
  hpr_id: string;
  full_name: string;
  qualification: string;
  specialty: string;
}

export async function findProviderByPhone(phone: string): Promise<ProviderLoginRow | null> {
  const rows = await query<ProviderLoginRow>(
    `SELECT a.provider_account_id,a.practitioner_id,a.phone,a.password_hash,
            a.is_active AS account_active,p.is_active AS practitioner_active,
            p.hpr_id,p.full_name,p.qualification,p.specialty
       FROM provider_accounts a JOIN practitioners p USING(practitioner_id)
      WHERE a.phone=$1`,
    [phone],
  );
  return rows[0] ?? null;
}

export async function providerFacilities(practitionerId: string): Promise<ProviderFacilityRow[]> {
  return query<ProviderFacilityRow>(
    `SELECT f.facility_id,f.name AS facility_name,f.external_abdm_id AS hfr_id,f.district_code,pf.role
       FROM practitioner_facilities pf JOIN facilities f USING(facility_id)
      WHERE pf.practitioner_id=$1 AND pf.is_active=true
      ORDER BY f.name`,
    [practitionerId],
  );
}

export async function insertSession(tokenHash: string, accountId: string, facilityId: string, expiresAt: Date): Promise<void> {
  await query(
    `INSERT INTO provider_sessions(token_hash,provider_account_id,facility_id,expires_at)
     VALUES($1,$2,$3,$4)`,
    [tokenHash, accountId, facilityId, expiresAt],
  );
}

export async function actorByTokenHash(tokenHash: string): Promise<ProviderActor | null> {
  const rows = await query<ProviderActor>(
    `SELECT a.provider_account_id,p.practitioner_id,p.hpr_id,p.full_name,p.qualification,p.specialty,
            f.facility_id,f.name AS facility_name,f.external_abdm_id AS hfr_id,f.district_code,pf.role
       FROM provider_sessions s
       JOIN provider_accounts a USING(provider_account_id)
       JOIN practitioners p USING(practitioner_id)
       JOIN practitioner_facilities pf ON pf.practitioner_id=p.practitioner_id AND pf.facility_id=s.facility_id
       JOIN facilities f ON f.facility_id=s.facility_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND a.is_active=true
        AND p.is_active=true AND pf.is_active=true`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await query("DELETE FROM provider_sessions WHERE token_hash=$1", [tokenHash]);
}
