-- =============================================================================
-- ResolveX — development seed data
-- =============================================================================
-- Apply AFTER db/schema.sql:  psql "$DATABASE_URL" -f db/seed.sql
--
-- Idempotent: re-running updates the demo rows rather than duplicating them.
--
-- !! DEVELOPMENT ONLY !!  Every demo account below shares the password
--    Password@123 — never load this file into a production database.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Departments — one per AI category (see server/src/services/ai/taxonomy.js).
-- The `slug` is the contract between the classifier and this table.
-- -----------------------------------------------------------------------------
INSERT INTO departments (name, slug, email) VALUES
  ('Academics',                    'academics',      'academics@resolvex.edu'),
  ('Examination & Evaluation',     'examination',    'exams@resolvex.edu'),
  ('Hostel & Residence',           'hostel',         'hostel@resolvex.edu'),
  ('Sanitation & Housekeeping',    'sanitation',     'sanitation@resolvex.edu'),
  ('Infrastructure & Maintenance', 'infrastructure', 'maintenance@resolvex.edu'),
  ('IT & Network Services',        'it-services',    'ithelpdesk@resolvex.edu'),
  ('Library',                      'library',        'library@resolvex.edu'),
  ('Transport',                    'transport',      'transport@resolvex.edu'),
  ('Accounts & Finance',           'accounts',       'accounts@resolvex.edu'),
  ('Health & Medical',             'health',         'healthcentre@resolvex.edu'),
  ('Discipline & Anti-Harassment', 'discipline',     'icc@resolvex.edu'),
  ('General Administration',       'general',        'admin@resolvex.edu')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, email = EXCLUDED.email;

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
-- crypt(..., gen_salt('bf', 10)) produces a $2a$ bcrypt hash that bcryptjs
-- verifies natively, so seeded accounts log in through the normal /auth/login.

-- Institute-level administrators. The Dean is the level-2 escalation target
-- (see ESCALATION_L2_EMAIL in server/.env.example).
INSERT INTO users (name, email, password_hash, role, department_id) VALUES
  ('Dr. Meera Dean',   'dean@resolvex.edu',      crypt('Password@123', gen_salt('bf', 10)), 'admin', NULL),
  ('Registrar Office', 'registrar@resolvex.edu', crypt('Password@123', gen_salt('bf', 10)), 'admin', NULL)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;

-- One Head of Department per department (the level-1 escalation target),
-- created generically so the set stays in step with the departments above.
INSERT INTO users (name, email, password_hash, role, department_id)
SELECT
  'HOD ' || d.name,
  'hod.' || d.slug || '@resolvex.edu',
  crypt('Password@123', gen_salt('bf', 10)),
  'handler',
  d.id
FROM departments d
ON CONFLICT (email) DO UPDATE
  SET name = EXCLUDED.name, department_id = EXCLUDED.department_id, role = 'handler';

-- Wire each department's hod_id to the account just created.
UPDATE departments d
   SET hod_id = u.id
  FROM users u
 WHERE u.email = 'hod.' || d.slug || '@resolvex.edu'
   AND d.hod_id IS DISTINCT FROM u.id;

-- Front-line handlers for the busiest departments.
INSERT INTO users (name, email, password_hash, role, department_id)
SELECT v.name, v.email, crypt('Password@123', gen_salt('bf', 10)), 'handler', d.id
FROM (VALUES
  ('Ravi Kulkarni', 'handler.hostel@resolvex.edu',         'hostel'),
  ('Priya Nair',    'handler.academics@resolvex.edu',      'academics'),
  ('Imran Sheikh',  'handler.it@resolvex.edu',             'it-services'),
  ('Sunita Rao',    'handler.sanitation@resolvex.edu',     'sanitation'),
  ('Alok Verma',    'handler.infrastructure@resolvex.edu', 'infrastructure')
) AS v(name, email, slug)
JOIN departments d ON d.slug = v.slug
ON CONFLICT (email) DO UPDATE
  SET name = EXCLUDED.name, department_id = EXCLUDED.department_id, role = 'handler';

-- Students (complainants).
INSERT INTO users (name, email, password_hash, role, department_id) VALUES
  ('Aarav Sharma',  'aarav@student.resolvex.edu',  crypt('Password@123', gen_salt('bf', 10)), 'student', NULL),
  ('Diya Patel',    'diya@student.resolvex.edu',   crypt('Password@123', gen_salt('bf', 10)), 'student', NULL),
  ('Kabir Menon',   'kabir@student.resolvex.edu',  crypt('Password@123', gen_salt('bf', 10)), 'student', NULL)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = 'student';

-- -----------------------------------------------------------------------------
-- Sample complaints
-- -----------------------------------------------------------------------------
-- Ages are expressed relative to now() so the escalation sweep has something to
-- act on the first time it runs:
--   • "wifi"      — 4 days idle  -> crosses the 3-day threshold  (level 1, HOD)
--   • "water"     — 7 days idle  -> crosses the 5-day threshold  (level 2, Dean)
--   • the rest    — fresh or already resolved -> no escalation
INSERT INTO complaints (
  title, description, category, status, priority, created_by, assigned_to,
  department_id, resolution_note, assigned_at, resolved_at, closed_at,
  created_at, last_activity_at
)
SELECT
  v.title, v.description, v.category, v.status::complaint_status,
  v.priority::complaint_priority,
  (SELECT id FROM users WHERE email = v.author),
  (SELECT id FROM users WHERE email = v.assignee),
  (SELECT id FROM departments WHERE slug = v.dept),
  v.resolution_note,
  CASE WHEN v.assignee IS NOT NULL THEN now() - v.age + interval '2 hours' END,
  CASE WHEN v.status IN ('Resolved', 'Closed') THEN now() - interval '1 day' END,
  CASE WHEN v.status = 'Closed' THEN now() - interval '12 hours' END,
  now() - v.age,
  now() - v.idle
FROM (VALUES
  ('Campus Wi-Fi drops every evening in Block C',
   'Since the start of the month the Wi-Fi in Block C disconnects between 8pm and 11pm every single day. It affects online submissions and I have already missed one deadline because of it.',
   'IT & Network Services', 'Assigned', 'high',
   'aarav@student.resolvex.edu', 'handler.it@resolvex.edu', 'it-services', NULL,
   interval '5 days', interval '4 days'),

  ('No drinking water supply on hostel floor 3',
   'The RO water purifier on the third floor of the boys hostel has been out of order for over a week. Residents are carrying water up three flights of stairs and nobody has responded to the register entry.',
   'Hostel & Residence', 'Submitted', 'urgent',
   'diya@student.resolvex.edu', NULL, 'hostel', NULL,
   interval '8 days', interval '7 days'),

  ('Internal marks for CS301 not uploaded on the portal',
   'The internal assessment marks for CS301 were promised two weeks ago but are still missing from the student portal, so I cannot verify my eligibility for the end-semester examination.',
   'Examination & Evaluation', 'Investigating', 'medium',
   'kabir@student.resolvex.edu', 'handler.academics@resolvex.edu', 'academics', NULL,
   interval '3 days', interval '6 hours'),

  ('Washrooms near the main lecture hall are not being cleaned',
   'The washrooms adjacent to LH-1 have not been cleaned for several days. There is standing water and the bins are overflowing, which is a hygiene risk given the footfall in that corridor.',
   'Sanitation & Housekeeping', 'Resolved', 'high',
   'aarav@student.resolvex.edu', 'handler.sanitation@resolvex.edu', 'sanitation',
   'Housekeeping supervisor reassigned two staff to this block and a twice-daily cleaning schedule is now posted at the entrance.',
   interval '6 days', interval '1 day'),

  ('Library reading room closes earlier than the notified time',
   'The notice board says the reading room is open until 10pm during examinations, but staff have been asking students to leave by 8:30pm for the past week without any announcement.',
   'Library', 'Submitted', 'low',
   'diya@student.resolvex.edu', NULL, 'library', NULL,
   interval '10 hours', interval '10 hours')
) AS v(title, description, category, status, priority, author, assignee, dept,
       resolution_note, age, idle)
WHERE NOT EXISTS (SELECT 1 FROM complaints c WHERE c.title = v.title);

-- Seed the audit trail so the citizen timeline is populated for demo tickets.
INSERT INTO complaint_status_history (complaint_id, from_status, to_status, actor_id, note, created_at)
SELECT c.id, NULL, 'Submitted', c.created_by, 'Complaint submitted', c.created_at
FROM complaints c
WHERE NOT EXISTS (
  SELECT 1 FROM complaint_status_history h WHERE h.complaint_id = c.id
);

INSERT INTO complaint_status_history (complaint_id, from_status, to_status, actor_id, note, created_at)
SELECT c.id, 'Submitted', c.status, c.assigned_to,
       'Routed to ' || d.name, c.assigned_at
FROM complaints c
JOIN departments d ON d.id = c.department_id
WHERE c.assigned_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM complaint_status_history h
     WHERE h.complaint_id = c.id AND h.to_status = c.status
  );

COMMIT;

-- Summary of what was loaded.
SELECT
  (SELECT count(*) FROM departments) AS departments,
  (SELECT count(*) FROM users)       AS users,
  (SELECT count(*) FROM complaints)  AS complaints;
