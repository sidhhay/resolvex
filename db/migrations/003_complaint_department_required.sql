-- Every complaint must belong to a real department.
-- Legacy rows without a department are routed to General Administration.
BEGIN;

INSERT INTO departments (name, slug)
VALUES ('General Administration', 'general')
ON CONFLICT (slug) DO NOTHING;

UPDATE complaints
   SET department_id = (SELECT id FROM departments WHERE slug = 'general')
 WHERE department_id IS NULL;

ALTER TABLE complaints
  DROP CONSTRAINT IF EXISTS complaints_department_id_fkey;

ALTER TABLE complaints
  ALTER COLUMN department_id SET NOT NULL;

ALTER TABLE complaints
  ADD CONSTRAINT complaints_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE RESTRICT;

COMMIT;
