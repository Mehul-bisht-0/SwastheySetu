import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testApp, authHeader, body } from "./helpers.ts";
import { healthCheck, pool } from "../src/db/pool.ts";
import { hashPassword } from "../src/util/hash.ts";
import { signToken } from "../src/plugins/auth.ts";

const dbUp = await healthCheck();

test("verified patient emergency moves through explicit dispatch states", { skip: !dbUp && "no database" }, async () => {
  const app = await testApp();
  const suffix = String(Date.now()).slice(-9);
  const phone = `+919${suffix}`;
  const district = process.env["DEMO_DISTRICT_CODE"] ?? "227";
  let patientId = "";
  let dispatcherId = "";
  let emergencyId = "";

  try {
    const registration = await app.inject({
      method: "POST", url: "/patients/register",
      payload: {
        phone, password: "Patient@test1!", fullName: "Emergency Test Patient",
        districtCode: district, homeAddress: "Test address, Nalanda",
        deviceId: `patient-test-${randomUUID()}`, platform: "unknown", appVersion: "0.1.0",
      },
    });
    assert.equal(registration.statusCode, 201, registration.payload);
    const registered = body<{ data: { accessToken: string; patient: { patientId: string } } }>(registration);
    const patientToken = registered.data.accessToken;
    patientId = registered.data.patient.patientId;

    const denied = await app.inject({
      method: "POST", url: "/emergencies", headers: authHeader(patientToken),
      payload: { emergencyType: "MEDICAL", latitude: 25.1985, longitude: 85.5267,
        address: "Test address, Nalanda", consentToShareLocation: true },
    });
    assert.equal(denied.statusCode, 403);

    const started = await app.inject({
      method: "POST", url: "/patients/verification/sessions", headers: authHeader(patientToken),
      payload: { method: "AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS", consent: true },
    });
    assert.equal(started.statusCode, 201, started.payload);
    const verification = body<{ data: { verificationSessionId: string } }>(started).data;

    const completed = await app.inject({
      method: "POST", url: "/patients/verification/mock-complete", headers: authHeader(patientToken),
      payload: { verificationSessionId: verification.verificationSessionId },
    });
    assert.equal(completed.statusCode, 200, completed.payload);

    const abhaStarted = await app.inject({
      method: "POST", url: "/patients/abha/link-sessions", headers: authHeader(patientToken),
      payload: { identifier: "emergency.test@abdm", consent: true },
    });
    assert.equal(abhaStarted.statusCode, 201, abhaStarted.payload);
    const abhaSessionId = body<{ data: { abhaLinkSessionId: string } }>(abhaStarted).data.abhaLinkSessionId;
    const abhaCompleted = await app.inject({
      method: "POST", url: "/patients/abha/mock-complete", headers: authHeader(patientToken),
      payload: {
        abhaLinkSessionId: abhaSessionId,
        summary: {
          bloodGroup: "O+",
          allergies: ["TEST ALLERGY - NOT CLINICAL DATA"],
          medications: ["TEST MEDICINE - NOT CLINICAL DATA"],
          conditions: ["TEST CONDITION - NOT CLINICAL DATA"],
        },
      },
    });
    assert.equal(abhaCompleted.statusCode, 200, abhaCompleted.payload);
    assert.equal(body<{ data: { summaryAvailable: boolean } }>(abhaCompleted).data.summaryAvailable, true);

    const triageReportId = randomUUID();
    const evaluatedAt = new Date().toISOString();
    const triageContext = {
      reportId: triageReportId,
      tier: "EMERGENCY" as const,
      decisionSource: "RED_FLAG" as const,
      patient: { ageMonths: 420, sex: "male" as const, pregnancy: "no" as const },
      symptoms: ["CONVULSION" as const],
      redFlagLabels: ["TEST RED FLAG - NOT CLINICAL DATA"],
      rulesetVersion: "test-rules-v1",
      evaluatedAt,
      disclaimer: "TEST ONLY - NOT A DIAGNOSIS",
    };
    const missingTriageConsent = await app.inject({
      method: "POST", url: "/emergencies", headers: authHeader(patientToken),
      payload: {
        emergencyType: "MEDICAL", latitude: 25.1985, longitude: 85.5267,
        address: "Test address, Nalanda", consentToShareLocation: true,
        consentToShareHealthSummary: false, triageContext,
      },
    });
    assert.equal(missingTriageConsent.statusCode, 400, missingTriageConsent.payload);

    const created = await app.inject({
      method: "POST", url: "/emergencies", headers: authHeader(patientToken),
      payload: { emergencyType: "MEDICAL", latitude: 25.1985, longitude: 85.5267,
        address: "Test address, Nalanda", notes: "Integration test",
        consentToShareLocation: true, consentToShareHealthSummary: true,
        consentToShareTriageContext: true,
        triageContext },
    });
    assert.equal(created.statusCode, 201, created.payload);
    const emergency = body<{ data: { emergencyId: string; status: string; clinicalSummaryShared: boolean; triageContextShared: boolean; facility: { distanceMeters: number } } }>(created).data;
    emergencyId = emergency.emergencyId;
    assert.equal(emergency.status, "DISPATCH_PENDING");
    assert.equal(emergency.clinicalSummaryShared, true);
    assert.equal(emergency.triageContextShared, true);
    assert.ok(emergency.facility.distanceMeters >= 0);

    const passwordHash = await hashPassword("Dispatcher@test1!");
    const dispatcher = await pool.query<{ user_id: string }>(
      `INSERT INTO users (phone, full_name, role, password_hash, district_code)
       VALUES ($1,'Emergency Test Dispatcher','SUPERVISOR',$2,$3) RETURNING user_id`,
      [`+918${suffix}`, passwordHash, district],
    );
    dispatcherId = dispatcher.rows[0]?.user_id ?? "";
    const dispatcherToken = signToken(app, {
      sub: dispatcherId, role: "SUPERVISOR", district, did: `dispatcher-test-${randomUUID()}`,
    });

    const queue = await app.inject({
      method: "GET", url: "/emergencies/dispatch-queue", headers: authHeader(dispatcherToken),
    });
    assert.equal(queue.statusCode, 200, queue.payload);
    const queued = body<{ data: { items: Array<{
      emergencyId: string;
      triageContext: { reportId: string; tier: string; symptoms: string[]; redFlagLabels: string[] } | null;
      notification: { deliveryStatus: string; channel: string } | null;
      clinicalSummary: { source: string; allergies: string[] } | null;
    }> } }>(queue)
      .data.items.find((item) => item.emergencyId === emergency.emergencyId);
    assert.equal(queued?.clinicalSummary?.source, "ABDM_DEVELOPMENT_MOCK");
    assert.deepEqual(queued?.clinicalSummary?.allergies, ["TEST ALLERGY - NOT CLINICAL DATA"]);
    assert.equal(queued?.triageContext?.reportId, triageReportId);
    assert.equal(queued?.triageContext?.tier, "EMERGENCY");
    assert.deepEqual(queued?.triageContext?.symptoms, ["CONVULSION"]);
    assert.deepEqual(queued?.triageContext?.redFlagLabels, ["TEST RED FLAG - NOT CLINICAL DATA"]);
    assert.equal(queued?.notification?.channel, "FACILITY_WEBHOOK");
    assert.equal(queued?.notification?.deliveryStatus, "PENDING");

    for (const status of ["FACILITY_NOTIFIED", "ACCEPTED", "AMBULANCE_DISPATCHED"] as const) {
      const changed = await app.inject({
        method: "POST", url: `/emergencies/${emergency.emergencyId}/status`,
        headers: authHeader(dispatcherToken), payload: { status },
      });
      assert.equal(changed.statusCode, 200, changed.payload);
      const changedEmergency = body<{ data: { status: string; notification: { deliveryStatus: string } | null } }>(changed).data;
      assert.equal(changedEmergency.status, status);
      if (status === "FACILITY_NOTIFIED") assert.equal(changedEmergency.notification?.deliveryStatus, "SENT");
    }

    const active = await app.inject({ method: "GET", url: "/emergencies/active", headers: authHeader(patientToken) });
    assert.equal(body<{ data: { status: string } }>(active).data.status, "AMBULANCE_DISPATCHED");
  } finally {
    if (emergencyId) await pool.query("DELETE FROM emergency_requests WHERE emergency_id = $1", [emergencyId]);
    if (patientId) await pool.query("DELETE FROM patients WHERE patient_id = $1", [patientId]);
    if (dispatcherId) await pool.query("DELETE FROM users WHERE user_id = $1", [dispatcherId]);
    await pool.query("DELETE FROM emergency_requests WHERE patient_id IN (SELECT patient_id FROM patients WHERE full_name = 'Emergency Test Patient')");
    await pool.query("DELETE FROM patients WHERE full_name = 'Emergency Test Patient'");
    await pool.query("DELETE FROM users WHERE full_name = 'Emergency Test Dispatcher'");
  }
});
