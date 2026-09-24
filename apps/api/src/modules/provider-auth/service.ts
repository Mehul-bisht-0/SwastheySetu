import { randomBytes } from "node:crypto";
import { abdm as contracts } from "@swasthyasetu/contracts";
import { unauthorized, badRequest } from "../../plugins/errors.ts";
import { sha256, verifyPassword } from "../../util/hash.ts";
import { findProviderByPhone, insertSession, providerFacilities, type ProviderActor } from "./repo.ts";

type Login = ReturnType<typeof contracts.providerLoginRequest.parse>;
type Session = ReturnType<typeof contracts.providerSession.parse>;
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function loginProvider(input: Login): Promise<Session> {
  const provider = await findProviderByPhone(input.phone);
  const passwordOk = await verifyPassword(input.password, provider?.password_hash ?? DUMMY_HASH);
  if (!provider || !passwordOk || !provider.account_active || !provider.practitioner_active) {
    throw unauthorized("Phone number or password is incorrect.");
  }
  const facilities = await providerFacilities(provider.practitioner_id);
  const facility = input.facilityId
    ? facilities.find((candidate) => candidate.facility_id === input.facilityId)
    : facilities[0];
  if (!facility) throw badRequest("Choose an active facility membership.");
  if (!facility.hfr_id) throw badRequest("This facility has no mock HFR identifier.");
  const accessToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await insertSession(sha256(accessToken), provider.provider_account_id, facility.facility_id, expiresAt);
  return {
    accessToken,
    expiresAt: expiresAt.toISOString(),
    provider: {
      accountId: provider.provider_account_id,
      practitionerId: provider.practitioner_id,
      hprId: provider.hpr_id,
      fullName: provider.full_name,
      qualification: provider.qualification,
      specialty: provider.specialty,
      facilityId: facility.facility_id,
      facilityName: facility.facility_name,
      hfrId: facility.hfr_id,
      districtCode: facility.district_code,
      role: facility.role,
    },
    mockNotice: contracts.MOCK_ABDM_LABEL,
  };
}

export function canReadClinical(actor: ProviderActor): boolean {
  return actor.role === "DOCTOR" || actor.role === "NURSE";
}

export function canPublish(actor: ProviderActor, recordType: string): boolean {
  if (actor.role === "DOCTOR") return true;
  return actor.role === "LAB_TECH" && recordType === "DIAGNOSTIC_REPORT";
}

export function providerView(actor: ProviderActor) {
  return {
    accountId: actor.provider_account_id,
    practitionerId: actor.practitioner_id,
    hprId: actor.hpr_id,
    fullName: actor.full_name,
    qualification: actor.qualification,
    specialty: actor.specialty,
    facilityId: actor.facility_id,
    facilityName: actor.facility_name,
    hfrId: actor.hfr_id,
    districtCode: actor.district_code,
    role: actor.role,
  };
}
