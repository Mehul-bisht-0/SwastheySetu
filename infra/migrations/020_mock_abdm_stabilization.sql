-- Append-only corrections for the development mock continuity network.
-- A referral exists before its consent grant, so the grant is attached later.
ALTER TABLE abdm_referrals ALTER COLUMN consent_grant_id DROP NOT NULL;

-- One referral creates one consent request. This closes the retry/crash gap.
CREATE UNIQUE INDEX abdm_consent_requests_referral_unique
  ON abdm_consent_requests(referral_id) WHERE referral_id IS NOT NULL;

