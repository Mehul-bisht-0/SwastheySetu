import { randomUUID } from "node:crypto";
import type { patients as patientContracts } from "@swasthyasetu/contracts";
import { config } from "../../config.ts";
import { withTransaction } from "../../db/tx.ts";
import { AppError, conflict, forbidden, notFound } from "../../plugins/errors.ts";
import { sha256 } from "../../util/hash.ts";
import { findById as findPatientById } from "../patients/repo.ts";
import {
  completeMockLink, findLinkSession, findShareableSummary, insertLinkSession, latestLink,
  type AbhaLinkRow,
} from "./repo.ts";

type StartRequest = ReturnType<typeof patientContracts.startAbhaLinkRequest.parse>;
type LinkSession = ReturnType<typeof patientContracts.abhaLinkSession.parse>;
type CompleteRequest = ReturnType<typeof patientContracts.completeMockAbhaLinkRequest.parse>;
type LinkStatus = ReturnType<typeof patientContracts.abhaLinkStatus.parse>;

function normalizeIdentifier(value: string): string {
  return value.includes("@") ? value.toLowerCase() : value.replace(/-/g, "");
}

function maskIdentifier(value: string): string {
  const normalized = normalizeIdentifier(value);
  if (normalized.includes("@")) {
    const [local = "", domain = ""] = normalized.split("@", 2);
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `****-****-**${normalized.slice(-4)}`;
}

function sessionView(row: AbhaLinkRow): LinkSession {
  return {
    abhaLinkSessionId: row.abha_link_session_id,
    provider: row.provider,
    identifierMasked: row.identifier_masked,
    status: row.status,
    linkMode: "DEVELOPMENT_MOCK",
    authorizationUrl: null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function startAbhaLink(patientId: string, input: StartRequest): Promise<LinkSession> {
  const patient = await findPatientById(patientId);
  if (!patient?.is_active || patient.verification_status !== "VERIFIED") {
    throw forbidden("Verified patient identity is required before linking ABHA.");
  }
  if (config.ABDM_MODE !== "mock") {
    throw new AppError("NOT_IMPLEMENTED", "An authorised ABDM HIU integration is not configured.", 501);
  }
  const normalized = normalizeIdentifier(input.identifier);
  const row = await withTransaction((client) => insertLinkSession(
    patientId, sha256(normalized), maskIdentifier(normalized), "abdm-development-mock", client,
  ));
  return sessionView(row);
}

export async function finishMockAbhaLink(patientId: string, input: CompleteRequest): Promise<LinkStatus> {
  if (config.NODE_ENV === "production" || config.ABDM_MODE !== "mock") {
    throw notFound("ABHA link session not found.");
  }
  const session = await findLinkSession(input.abhaLinkSessionId, patientId);
  if (!session) throw notFound("ABHA link session not found.");
  if (session.status !== "PENDING") throw conflict("ABHA link session is no longer pending.");
  await withTransaction((client) => completeMockLink({
    sessionId: input.abhaLinkSessionId,
    patientId,
    consentReference: `mock-consent-${randomUUID()}`,
    bloodGroup: input.summary.bloodGroup,
    allergies: input.summary.allergies,
    medications: input.summary.medications,
    conditions: input.summary.conditions,
  }, client));
  return getAbhaStatus(patientId);
}

export async function getAbhaStatus(patientId: string): Promise<LinkStatus> {
  const [link, summary] = await Promise.all([latestLink(patientId), findShareableSummary(patientId)]);
  return {
    linked: link?.status === "LINKED",
    identifierMasked: link?.identifier_masked ?? null,
    summaryAvailable: summary !== null,
    summaryValidUntil: summary
      ? new Date(Math.min(summary.expires_at.getTime(), summary.consent_valid_until.getTime())).toISOString()
      : null,
    source: summary?.source ?? null,
  };
}
