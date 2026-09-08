# Patient identity and emergency dispatch

## Status

This is a development prototype, not an emergency service. It does not integrate a live identity
provider, facility messaging provider, ambulance fleet or government emergency system. Calling 112
remains the primary immediate action shown to the patient.

## Implemented flow

```text
Patient register/login
  -> explicit identity-verification consent
  -> authorised-provider boundary (development mock today)
  -> VERIFIED provider outcome stored without raw documents or biometrics
  -> optional ABHA link and time-bound health-information consent
  -> authenticated urgent symptom check returns EMERGENCY or GO_NOW
  -> explicit SOS and precise-location sharing consent
  -> optional per-SOS consent to share a minimal triage snapshot (never raw answers)
  -> optional per-SOS consent to share the valid minimal emergency summary
  -> nearest facility declaring EMERGENCY_24X7 + AMBULANCE capabilities selected
  -> transactional notification outbox created
  -> district dispatcher records each real-world transition
  -> patient sees the same auditable status
```

The states deliberately distinguish `DISPATCH_PENDING`, `FACILITY_NOTIFIED`, `ACCEPTED` and
`AMBULANCE_DISPATCHED`. Selecting a facility is not evidence that it received the request; acceptance
is not evidence that an ambulance was sent.

For the hackathon, the district dispatcher screen acts as an in-app facility-alert simulator. It polls
the API every three seconds and shows the target facility, verified patient contact and pickup location,
notification-outbox status, and any separately consented triage or ABHA metadata. This is useful for an
end-to-end demonstration, but it is not a live hospital notification channel.

The triage snapshot is purpose-limited to the urgent handoff. It contains the urgency tier,
age/sex/pregnancy context, selected symptom codes, red-flag labels, ruleset version and evaluation time.
It excludes raw follow-up answers and does not add a diagnosis or treatment recommendation.

## Identity boundary

The application database stores only:

- an opaque provider name and reference;
- the combined method (`AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS`);
- consent, outcome and timestamps; and
- the patient verification status.

It does not store Aadhaar numbers, Virtual IDs, Aadhaar card images, e-KYC XML, selfies, liveness
video or face embeddings/templates. Production upload must go directly from the device to an
authorised provider using a short-lived provider session. SwasthyaSetu should receive a signed,
replay-protected outcome callback and retain only the minimum audit record.

UIDAI describes Aadhaar Paperless Offline e-KYC as voluntary, holder-driven and able to avoid
collecting or storing the Aadhaar number:
https://www.uidai.gov.in/en/ecosystem/authentication-devices-documents/about-aadhaar-paperless-offline-e-kyc.html

Current Aadhaar authentication/offline-verification regulations and amendments must be reviewed with
qualified counsel and the selected provider before a pilot:
https://uidai.gov.in/en/about-uidai/legal-framework/regulations.html

The Digital Personal Data Protection Rules, 2025 and their staged commencement also require a formal
data map, notices, consent/withdrawal, processor contracts, safeguards, breach procedures, deletion and
grievance handling:
https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa

## Dispatch boundary

`dispatch_notifications` is a transactional outbox. Creating an SOS and its notification job happens
in one database transaction. A production worker still needs to:

1. claim pending jobs with locking and bounded retries;
2. deliver to an authenticated facility webhook, SMS or voice provider;
3. verify provider acknowledgements and deduplicate retries;
4. mark `FACILITY_NOTIFIED` only after confirmed delivery;
5. fail over to another capable facility or a staffed escalation desk under an approved policy; and
6. alert the patient to call 112 whenever delivery or acceptance fails.

The current dispatcher queue is district-scoped to `SUPERVISOR` and `ADMIN` roles. A real deployment
needs facility-operator identities and an explicit user-to-facility assignment table so one facility
cannot view another facility's patient details.

## ABHA and emergency clinical-summary boundary

ABHA is the patient's 14-digit health identifier (or ABHA address) in the Ayushman Bharat Digital
Mission ecosystem. The card is not a medical-history document. Health records remain with Health
Information Providers and may be fetched by a registered Health Information User only through the
ABDM consent and health-information exchange flow.

The prototype therefore does not upload or parse an ABHA card image. It stores only:

- a SHA-256 hash and masked display form of the supplied ABHA identifier;
- an opaque provider consent reference and its purpose, status and validity window;
- a short-lived minimal summary of blood group, allergies, medicines and known conditions; and
- which emergency request received the summary and when it was shared.

The patient must already be identity-verified, explicitly consent to ABHA linking, and separately opt
in on the SOS screen before a currently valid summary is attached. An SOS can always be sent without
the summary. Expired or revoked consent is not shareable. The dispatcher view is clinical context only:
it does not diagnose, prescribe, select treatment or generate automated first-aid instructions.

`ABDM_MODE=mock` is development-only and accepts synthetic summary fields to exercise the flow. It is
rejected when `NODE_ENV=production`. A live implementation requires ABDM HIU onboarding, a Consent
Manager flow, signed callbacks, FHIR R4 health-information exchange, encryption/key management,
purpose and retention approval, revocation handling, and a clinically approved ambulance workflow.

ABDM's official FAQ explains that ABHA supports identification and consent-based record sharing, and
that consent can be granular and time-bound:
https://abdm.gov.in/FAQ

The ABDM implementation documentation describes HIU consent requests and the FHIR-based exchange:
https://docs.coronasafe.network/abdm-documentation/implementers-guide/key-concepts
https://docs.coronasafe.network/abdm-documentation/overview-of-fhr-framework/apis-and-standards

## Production gates

- Clinical and emergency-program owner approval.
- Authorised identity provider and lawful Aadhaar/offline-KYC usage review.
- Registered ABDM HIU/Consent Manager integration, certification and consent-revocation handling.
- Clinical approval of the minimal emergency data set and ambulance display; no automated treatment.
- Alternative non-Aadhaar identity route; emergency guidance cannot be denied behind verification.
- HTTPS, encryption/key management, audit review and penetration testing.
- Facility contracts, staffed dispatch desk, acknowledgements, escalation and service-level targets.
- Real ambulance/facility roster rather than capability tags alone.
- Abuse controls that do not delay a genuine emergency.
- Data-retention/deletion, backup deletion, grievance and incident-response procedures.
- Supervised drills covering no network, wrong GPS, rejected identity, duplicate SOS, facility decline,
  provider outage, lost device and dispatcher non-response.
