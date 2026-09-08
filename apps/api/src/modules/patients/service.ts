import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { patients as patientContracts } from "@swasthyasetu/contracts";
import { config } from "../../config.ts";
import { withTransaction } from "../../db/tx.ts";
import { AppError, conflict, notFound, unauthorized } from "../../plugins/errors.ts";
import { signToken } from "../../plugins/auth.ts";
import { hashPassword, verifyPassword } from "../../util/hash.ts";
import {
  completeMockVerification, findById, findByPhone, findVerificationSession,
  insertPatient, insertVerificationSession, upsertDevice,
  type PatientRow, type VerificationRow,
} from "./repo.ts";

type RegisterRequest = ReturnType<typeof patientContracts.registerRequest.parse>;
type LoginRequest = ReturnType<typeof patientContracts.loginRequest.parse>;
type AuthResponse = ReturnType<typeof patientContracts.authResponse.parse>;
type Profile = ReturnType<typeof patientContracts.patientProfile.parse>;
type StartVerificationRequest = ReturnType<typeof patientContracts.startVerificationRequest.parse>;
type VerificationSession = ReturnType<typeof patientContracts.verificationSession.parse>;

const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function profile(row: PatientRow): Profile {
  return {
    patientId: row.patient_id,
    phone: row.phone,
    fullName: row.full_name,
    districtCode: row.district_code,
    homeAddress: row.home_address,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at?.toISOString() ?? null,
  };
}

function authResponse(app: FastifyInstance, row: PatientRow, deviceId: string): AuthResponse {
  const accessToken = signToken(app, {
    sub: row.patient_id,
    role: "PATIENT",
    district: row.district_code,
    did: deviceId,
  });
  const decoded = app.jwt.decode<{ exp: number }>(accessToken);
  return {
    accessToken,
    expiresAt: new Date((decoded?.exp ?? Math.floor(Date.now() / 1000) + 2_592_000) * 1000).toISOString(),
    patient: profile(row),
  };
}

export async function registerPatient(app: FastifyInstance, input: RegisterRequest): Promise<AuthResponse> {
  if (await findByPhone(input.phone)) throw conflict("A patient account already uses this phone number.");
  const passwordHash = await hashPassword(input.password);
  const row = await withTransaction(async (client) => {
    const inserted = await insertPatient(input, passwordHash, client);
    await upsertDevice(input.deviceId, inserted.patient_id, input.platform, input.appVersion, client);
    return inserted;
  });
  return authResponse(app, row, input.deviceId);
}

export async function loginPatient(app: FastifyInstance, input: LoginRequest): Promise<AuthResponse> {
  const row = await findByPhone(input.phone);
  const passwordOk = await verifyPassword(input.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !passwordOk || !row.is_active) throw unauthorized("Phone number or password is incorrect.");
  await upsertDevice(input.deviceId, row.patient_id, input.platform, input.appVersion);
  return authResponse(app, row, input.deviceId);
}

export async function getPatientProfile(patientId: string): Promise<Profile> {
  const row = await findById(patientId);
  if (!row || !row.is_active) throw unauthorized("Session is no longer valid.");
  return profile(row);
}

function verificationResponse(row: VerificationRow): VerificationSession {
  return {
    verificationSessionId: row.verification_session_id,
    method: row.method,
    provider: row.provider,
    status: row.status,
    uploadMode: "DEVELOPMENT_MOCK",
    uploadUrl: null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function startVerification(
  patientId: string,
  input: StartVerificationRequest,
): Promise<VerificationSession> {
  if (config.IDENTITY_PROVIDER_MODE !== "mock") {
    throw new AppError("NOT_IMPLEMENTED", "An authorised identity provider is not configured.", 501);
  }
  const row = await withTransaction((client) =>
    insertVerificationSession(patientId, input.method, "development-mock", client));
  return verificationResponse(row);
}

export async function finishMockVerification(patientId: string, sessionId: string): Promise<Profile> {
  if (config.NODE_ENV === "production" || config.IDENTITY_PROVIDER_MODE !== "mock") {
    throw notFound("Verification session not found.");
  }
  const session = await findVerificationSession(sessionId, patientId);
  if (!session) throw notFound("Verification session not found.");
  if (session.status !== "PENDING") throw conflict("Verification session is no longer pending.");
  await withTransaction((client) =>
    completeMockVerification(sessionId, patientId, `mock-${randomUUID()}`, client));
  return getPatientProfile(patientId);
}
