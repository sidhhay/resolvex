-- =============================================================================
-- ResolveX — AI-Assisted Grievance & Escalation Management System
-- PostgreSQL schema (DDL)
-- =============================================================================
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql
--
-- The script is idempotent: it can be re-run safely against an existing
-- database. Every object is created with IF NOT EXISTS or guarded by a DO block.
-- =============================================================================

BEGIN;

-- pgcrypto is used by seed.sql to hash demo passwords with bcrypt (crypt/gen_salt).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- citext gives us case-insensitive, still-unique e-mail addresses.
CREATE EXTENSION IF NOT EXISTS citext;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
-- Postgres has no CREATE TYPE ... IF NOT EXISTS, so each type is guarded.

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'handler', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The six states of the State pattern implemented in
-- server/src/domain/complaintState.js. Keeping them as a DB enum means an
-- invalid status can never be persisted, even by a buggy caller or a manual
-- UPDATE — the database is the last line of defence behind the state machine.
DO $$ BEGIN
  CREATE TYPE complaint_status AS ENUM (
    'Submitted', 'Assigned', 'Investigating', 'Resolved', 'Closed', 'Escalated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- departments
-- -----------------------------------------------------------------------------
-- `hod_id` is a forward reference to users(id); the FK is added after the users
-- table exists (see "deferred foreign keys" below). departments <-> users is a
-- genuine cycle: a department has a head, and every user belongs to a department.
CREATE TABLE IF NOT EXISTS departments (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  email       CITEXT,                       -- shared inbox, used by the mailer
  hod_id      BIGINT,                       -- FK -> users(id), added below
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_name_key UNIQUE (name),
  CONSTRAINT departments_slug_key UNIQUE (slug),
  CONSTRAINT departments_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT departments_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT        NOT NULL,
  email          CITEXT      NOT NULL,
  password_hash  TEXT        NOT NULL,
  role           user_role   NOT NULL DEFAULT 'student',
  -- ON DELETE SET NULL: removing a department must never orphan/delete people.
  department_id  BIGINT      REFERENCES departments (id) ON DELETE SET NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT users_email_format CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- A handler is only meaningful inside a department; students and institute-level
  -- admins may sit outside the departmental tree.
  CONSTRAINT users_handler_needs_department
    CHECK (role <> 'handler' OR department_id IS NOT NULL)
);

-- Deferred foreign key closing the departments <-> users cycle.
DO $$ BEGIN
  ALTER TABLE departments
    ADD CONSTRAINT departments_hod_id_fkey
    FOREIGN KEY (hod_id) REFERENCES users (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- complaints
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaints (
  id               BIGSERIAL PRIMARY KEY,
  title            TEXT               NOT NULL,
  description      TEXT               NOT NULL,
  -- Free text rather than an enum: the AI taxonomy in
  -- server/src/services/ai/taxonomy.js evolves faster than a migration cycle.
  category         TEXT               NOT NULL,
  status           complaint_status   NOT NULL DEFAULT 'Submitted',
  priority         complaint_priority NOT NULL DEFAULT 'medium',
  attachment_url   TEXT,
  -- RESTRICT: a complaint is an accountability record; deleting the author must
  -- be a deliberate act (anonymise instead of cascading the evidence away).
  created_by       BIGINT             NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_to      BIGINT             REFERENCES users (id) ON DELETE SET NULL,
  department_id    BIGINT             REFERENCES departments (id) ON DELETE SET NULL,

  -- ---- Fields beyond the base spec, required by the SLA / analytics features --
  resolution_note  TEXT,        -- mandatory to enter 'Resolved' (see CHECK below)
  closure_note     TEXT,
  escalation_level SMALLINT           NOT NULL DEFAULT 0,  -- 0 = never escalated
  ai_confidence    NUMERIC(4, 3),     -- 0.000 .. 1.000, from classifyTicket()
  ai_strategy      TEXT,              -- which Strategy produced the classification
  assigned_at      TIMESTAMPTZ,       -- powers "time to assignment" analytics
  resolved_at      TIMESTAMPTZ,       -- powers "time to resolution" / SLA compliance
  closed_at        TIMESTAMPTZ,
  -- The SLA clock read by the Chain of Responsibility. Deliberately separate from
  -- updated_at: only *meaningful* activity (a transition, an assignment, a note)
  -- pushes it forward, so a cosmetic row touch cannot silently reset the SLA.
  last_activity_at TIMESTAMPTZ        NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),

  CONSTRAINT complaints_title_len       CHECK (length(btrim(title)) BETWEEN 5 AND 200),
  CONSTRAINT complaints_description_len CHECK (length(btrim(description)) BETWEEN 20 AND 5000),
  CONSTRAINT complaints_category_not_blank CHECK (length(btrim(category)) > 0),
  CONSTRAINT complaints_escalation_level_range CHECK (escalation_level BETWEEN 0 AND 2),
  CONSTRAINT complaints_ai_confidence_range
    CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1),
  -- Structural invariants mirroring the State pattern's guards. The state machine
  -- enforces these first with friendly errors; these CHECKs make them unbypassable.
  CONSTRAINT complaints_assigned_requires_assignee
    CHECK (status <> 'Assigned' OR assigned_to IS NOT NULL),
  CONSTRAINT complaints_resolved_requires_note
    CHECK (status <> 'Resolved' OR length(btrim(coalesce(resolution_note, ''))) > 0),
  CONSTRAINT complaints_resolved_at_set
    CHECK (status <> 'Resolved' OR resolved_at IS NOT NULL),
  CONSTRAINT complaints_closed_at_set
    CHECK (status <> 'Closed' OR closed_at IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- complaint_status_history  (audit trail -> powers the citizen status timeline)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_status_history (
  id           BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT           NOT NULL REFERENCES complaints (id) ON DELETE CASCADE,
  from_status  complaint_status,                        -- NULL for the initial row
  to_status    complaint_status NOT NULL,
  -- NULL actor = performed by the system (the escalation cron job).
  actor_id     BIGINT           REFERENCES users (id) ON DELETE SET NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- escalations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escalations (
  id           BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT      NOT NULL REFERENCES complaints (id) ON DELETE CASCADE,
  level        SMALLINT    NOT NULL,          -- 1 = HOD, 2 = Dean / Director
  reason       TEXT        NOT NULL,
  escalated_to BIGINT      REFERENCES users (id) ON DELETE SET NULL,
  "timestamp"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT escalations_level_range CHECK (level BETWEEN 1 AND 2),
  CONSTRAINT escalations_reason_not_blank CHECK (length(btrim(reason)) > 0),
  -- Idempotency guard for the cron sweep: a complaint can be escalated to each
  -- level at most once, so a job that runs twice (or two workers racing) cannot
  -- produce duplicate escalations or duplicate e-mails.
  CONSTRAINT escalations_complaint_level_key UNIQUE (complaint_id, level)
);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message      TEXT        NOT NULL,
  -- Optional deep link so the bell menu can navigate straight to the ticket.
  complaint_id BIGINT      REFERENCES complaints (id) ON DELETE CASCADE,
  event_type   TEXT,                                 -- e.g. 'complaint.escalated'
  is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_message_not_blank CHECK (length(btrim(message)) > 0)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Required by the brief: status, department and created_at on complaints.
CREATE INDEX IF NOT EXISTS idx_complaints_status        ON complaints (status);
CREATE INDEX IF NOT EXISTS idx_complaints_department_id ON complaints (department_id);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at    ON complaints (created_at DESC);

-- Dashboard access paths: "my tickets" and "my queue", newest first.
CREATE INDEX IF NOT EXISTS idx_complaints_created_by
  ON complaints (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_to
  ON complaints (assigned_to, created_at DESC)
  WHERE assigned_to IS NOT NULL;

-- The handler dashboard's default view: open tickets in one department by status.
CREATE INDEX IF NOT EXISTS idx_complaints_department_status_created
  ON complaints (department_id, status, created_at DESC);

-- The escalation sweep's access path. A partial index keeps it tiny: closed
-- work is the bulk of the table over time and is never a candidate for the
-- Chain of Responsibility.
CREATE INDEX IF NOT EXISTS idx_complaints_sla_sweep
  ON complaints (last_activity_at)
  WHERE status NOT IN ('Resolved', 'Closed');

CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints (category);

CREATE INDEX IF NOT EXISTS idx_status_history_complaint
  ON complaint_status_history (complaint_id, created_at);

CREATE INDEX IF NOT EXISTS idx_escalations_complaint  ON escalations (complaint_id);
CREATE INDEX IF NOT EXISTS idx_escalations_timestamp  ON escalations ("timestamp" DESC);

-- The bell menu reads unread-first; a partial index serves the badge count.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id)
  WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_users_department_role ON users (department_id, role);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Keeps updated_at honest regardless of which code path performed the UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_complaints_updated_at ON complaints;
CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Password Reset & OTP Login
-- =============================================================================

-- Password reset: hashed token + expiry stored on the user row.
-- Using SHA-256 hex of the raw token; raw token only ever lives in the email link.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- OTP login codes. One active row per user; re-requesting overwrites it.
CREATE TABLE IF NOT EXISTS auth_otps (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash    TEXT        NOT NULL,          -- SHA-256 of the 6-digit code
  expires_at   TIMESTAMPTZ NOT NULL,
  used         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_otps_user_key UNIQUE (user_id)  -- one active OTP per user
);
CREATE INDEX IF NOT EXISTS idx_auth_otps_user ON auth_otps (user_id);

COMMIT;
