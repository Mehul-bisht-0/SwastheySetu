-- Add Marathi to the two persisted intake language fields. This changes only
-- presentation metadata; triage and routing decisions remain language-neutral.

ALTER TABLE intake_cases
  DROP CONSTRAINT IF EXISTS intake_cases_language_check;
ALTER TABLE intake_cases
  ADD CONSTRAINT intake_cases_language_check CHECK (language IN ('hi', 'mr', 'en'));

ALTER TABLE ivr_calls
  DROP CONSTRAINT IF EXISTS ivr_calls_language_check;
ALTER TABLE ivr_calls
  ADD CONSTRAINT ivr_calls_language_check CHECK (language IN ('hi', 'mr', 'en'));
