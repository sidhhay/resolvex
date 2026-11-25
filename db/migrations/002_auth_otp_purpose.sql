-- Keep sign-in and password-reset codes independent so one cannot be
-- replayed for the other purpose.
ALTER TABLE auth_otps
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'login';

ALTER TABLE auth_otps
  DROP CONSTRAINT IF EXISTS auth_otps_user_key;

CREATE UNIQUE INDEX IF NOT EXISTS auth_otps_user_purpose_key
  ON auth_otps (user_id, purpose);

ALTER TABLE auth_otps
  ADD CONSTRAINT auth_otps_purpose_check
  CHECK (purpose IN ('login', 'password_reset'));
