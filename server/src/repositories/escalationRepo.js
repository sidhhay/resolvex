/** Data access for escalation records. */
import { query } from '../config/db.js';

/**
 * @typedef {Object} EscalationRecord
 * @property {number} id
 * @property {number} complaint_id
 * @property {number} level
 * @property {string} reason
 * @property {number | null} escalated_to
 * @property {Date} timestamp
 */

/**
 * Records an escalation. Runs on the caller's client so it commits atomically
 * with the complaint's status change.
 *
 * The UNIQUE (complaint_id, level) constraint makes this idempotent: a second
 * sweep for the same level raises 23505, which `translateDbError` turns into a
 * ConflictError that the job treats as "already handled".
 *
 * @param {import('pg').PoolClient} client
 * @param {{ complaintId: number, level: number, reason: string, escalatedTo?: number | null }} input
 * @returns {Promise<EscalationRecord>}
 */
export async function createWithClient(client, input) {
  const { rows } = await client.query(
    `INSERT INTO escalations (complaint_id, level, reason, escalated_to)
     VALUES ($1, $2, $3, $4)
     RETURNING id, complaint_id, level, reason, escalated_to, "timestamp"`,
    [input.complaintId, input.level, input.reason, input.escalatedTo ?? null],
  );
  return rows[0];
}

/**
 * @param {number} complaintId
 * @returns {Promise<Array<EscalationRecord & { escalated_to_name: string | null }>>}
 */
export async function listForComplaint(complaintId) {
  const { rows } = await query(
    `SELECT e.id, e.complaint_id, e.level, e.reason, e.escalated_to, e."timestamp",
            u.name AS escalated_to_name
       FROM escalations e
       LEFT JOIN users u ON u.id = e.escalated_to
      WHERE e.complaint_id = $1
      ORDER BY e."timestamp" ASC`,
    [complaintId],
  );
  return rows;
}

/**
 * The admin escalation log.
 *
 * @param {{ limit?: number, offset?: number, level?: number | null, departmentId?: number | null }} [options]
 * @returns {Promise<{ rows: Array<Record<string, unknown>>, total: number }>}
 */
export async function listRecent(options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const params = [options.level ?? null, options.departmentId ?? null, limit, offset];

  const { rows } = await query(
    `SELECT e.id, e.complaint_id, e.level, e.reason, e."timestamp",
            c.title AS complaint_title, c.status AS complaint_status,
            c.created_at AS complaint_created_at,
            d.name AS department_name,
            u.name AS escalated_to_name, u.email AS escalated_to_email
       FROM escalations e
       JOIN complaints c ON c.id = e.complaint_id
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN users u ON u.id = e.escalated_to
      WHERE ($1::smallint IS NULL OR e.level = $1)
        AND ($2::bigint IS NULL OR c.department_id = $2)
      ORDER BY e."timestamp" DESC
      LIMIT $3 OFFSET $4`,
    params,
  );

  const { rows: countRows } = await query(
    `SELECT count(*)::int AS total
       FROM escalations e
       JOIN complaints c ON c.id = e.complaint_id
      WHERE ($1::smallint IS NULL OR e.level = $1)
        AND ($2::bigint IS NULL OR c.department_id = $2)`,
    [options.level ?? null, options.departmentId ?? null],
  );

  return { rows, total: countRows[0]?.total ?? 0 };
}
