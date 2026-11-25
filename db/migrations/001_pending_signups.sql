-- Run once against the existing production Neon database.
CREATE TABLE IF NOT EXISTS pending_signups (
  email         CITEXT PRIMARY KEY,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  code_hash     TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      SMALLINT    NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pending_signups_attempts_range CHECK (attempts BETWEEN 0 AND 5),
  CONSTRAINT pending_signups_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_pending_signups_expires_at ON pending_signups (expires_at);
