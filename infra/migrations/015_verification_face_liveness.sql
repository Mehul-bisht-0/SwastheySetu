-- Make the verification method accurately describe the combined check required
-- by the patient flow. The provider, not SwasthyaSetu, handles the selfie,
-- liveness detection and face comparison.

ALTER TABLE identity_verification_sessions
  DROP CONSTRAINT identity_verification_sessions_method_check;

UPDATE identity_verification_sessions
   SET method = 'AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS'
 WHERE method = 'AADHAAR_OFFLINE_EKYC';

ALTER TABLE identity_verification_sessions
  ADD CONSTRAINT identity_verification_sessions_method_check CHECK
    (method IN ('AADHAAR_OFFLINE_EKYC_WITH_FACE_LIVENESS'));
