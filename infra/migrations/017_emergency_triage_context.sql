-- Minimal patient-consented triage metadata for an emergency facility alert.
-- Raw questionnaire answers are deliberately excluded. The snapshot remains
-- non-diagnostic and records exactly what was shared with this request.

ALTER TABLE emergency_requests
  ADD COLUMN triage_context jsonb,
  ADD COLUMN triage_context_shared_at timestamptz,
  ADD CONSTRAINT emergency_triage_context_object CHECK
    (triage_context IS NULL OR jsonb_typeof(triage_context) = 'object'),
  ADD CONSTRAINT emergency_triage_context_consent_pair CHECK
    ((triage_context IS NULL) = (triage_context_shared_at IS NULL));
