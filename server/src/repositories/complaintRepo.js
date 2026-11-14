/**
 * Data access for complaints and their status history.
 *
 * Write paths take an explicit `client` so a transition can update the
 * complaint, append to the audit trail and record an escalation inside one
 * transaction (see services/complaintService.js).
 */
import { query } from '../config/db.js';
import { COMPLAINT_STATUSES, OPEN_STATUSES } from '../domain/complaintState.js';

/**
 * @typedef {Object} ComplaintRecord
 * @property {number} id
 * @property {string} title
 * @property {string} description
 * @property {string} category
 * @property {import('../domain/complaintState.js').ComplaintStatus} status
 * @property {'low' | 'medium' | 'high' | 'urgent'} priority
 * @property {string | null} attachment_url
 * @property {number} created_by
 * @property {number | null} assigned_to
 * @property {number | null} department_id
 * @property {string | null} resolution_note
 * @property {string | null} closure_note
 * @property {number} escalation_level
 * @property {number | null} ai_confidence
 * @property {string | null} ai_strategy
 * @property {Date | null} assigned_at
 * @property {Date | null} resolved_at
 * @property {Date | null} closed_at
 * @property {Date} last_activity_at
 * @property {Date} created_at
 * @property {Date} updated_at
 * @property {string} [creator_name]
 * @property {string} [creator_email]
 * @property {string | null} [assignee_name]
 * @property {string | null} [assignee_email]
 * @property {string | null} [department_name]
 * @property {string | null} [department_slug]
 * @property {number | null} [department_hod_id]
 */

const SELECT_COMPLAINT = `
  SELECT c.*,
         cu.name  AS creator_name,
         cu.email AS creator_email,
         au.name  AS assignee_name,
         au.email AS assignee_email,
         d.name   AS department_name,
         d.slug   AS department_slug,
         d.hod_id AS department_hod_id
    FROM complaints c
    JOIN users cu ON cu.id = c.created_by
    LEFT JOIN users au ON au.id = c.assigned_to
    LEFT JOIN departments d ON d.id = c.department_id
`;

/**
 * Columns a transition patch is allowed to touch. The patch keys come from
 * `buildPatch()`, but whitelisting here means a future bug in the domain layer
 * still cannot reach an arbitrary column.
 */
const PATCHABLE_COLUMNS = Object.freeze(new Set([
  'status',
  'assigned_to',
  'department_id',
  'resolution_note',
  'closure_note',
  'escalation_level',
  'assigned_at',
  'resolved_at',
  'closed_at',
  'last_activity_at',
  'priority',
  'category',
  'attachment_url',
]));

/**
 * @param {{ title: string, description: string, category: string,
 *           createdBy: number, departmentId: number | null,
 *           priority?: string, attachmentUrl?: string | null,
 *           aiConfidence?: number | null, aiStrategy?: string | null }} input
 * @returns {Promise<ComplaintRecord>}
 */
export async function create(input) {
  const { rows } = await query(
    `INSERT INTO complaints
       (title, description, category, department_id, created_by, priority,
        attachment_url, ai_confidence, ai_strategy)
     VALUES ($1, $2, $3, $4, $5, $6::complaint_priority, $7, $8, $9)
     RETURNING id`,
    [
      input.title,
      input.description,
      input.category,
      input.departmentId,
      input.createdBy,
      input.priority ?? 'medium',
      input.attachmentUrl ?? null,
      input.aiConfidence ?? null,
      input.aiStrategy ?? null,
    ],
  );
  return /** @type {ComplaintRecord} */ (await findById(rows[0].id));
}

/**
 * @param {number} id
 * @returns {Promise<ComplaintRecord | null>}
 */
export async function findById(id) {
  const { rows } = await query(`${SELECT_COMPLAINT} WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Reads a complaint inside a transaction and takes a row lock.
 *
 * The lock is what makes concurrent transitions safe: two handlers clicking
 * "Mark resolved" at the same moment are serialised, so the second one sees the
 * post-commit status and its transition is rejected by the state machine
 * instead of silently overwriting the first.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} id
 * @returns {Promise<ComplaintRecord | null>}
 */
export async function findByIdForUpdate(client, id) {
  // FOR UPDATE OF c: lock only the complaint row, not the joined users/department.
  const { rows } = await client.query(`${SELECT_COMPLAINT} WHERE c.id = $1 FOR UPDATE OF c`, [id]);
  return rows[0] ?? null;
}

/**
 * Applies a validated patch. Column names are whitelisted; values are bound.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} id
 * @param {Record<string, unknown>} patch
 * @returns {Promise<ComplaintRecord>}
 */
export async function applyPatch(client, id, patch) {
  const entries = Object.entries(patch).filter(([column]) => PATCHABLE_COLUMNS.has(column));
  if (entries.length === 0) {
    return /** @type {ComplaintRecord} */ (await findById(id));
  }

  const assignments = entries.map(([column], index) => {
    // `status` and `priority` are enum columns and need an explicit cast when
    // supplied as a bound parameter.
    if (column === 'status') return `status = $${index + 2}::complaint_status`;
    if (column === 'priority') return `priority = $${index + 2}::complaint_priority`;
    return `${column} = $${index + 2}`;
  });

  const { rows } = await client.query(
    `UPDATE complaints SET ${assignments.join(', ')} WHERE id = $1 RETURNING id`,
    [id, ...entries.map(([, value]) => value)],
  );
  if (rows.length === 0) return /** @type {ComplaintRecord} */ (await findById(id));

  const { rows: fresh } = await client.query(`${SELECT_COMPLAINT} WHERE c.id = $1`, [id]);
  return fresh[0];
}

/**
 * Appends to the audit trail that backs the citizen status timeline.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ complaintId: number, fromStatus: string | null, toStatus: string,
 *           actorId: number | null, note?: string | null }} entry
 * @returns {Promise<void>}
 */
export async function insertStatusHistory(client, entry) {
  await client.query(
    `INSERT INTO complaint_status_history (complaint_id, from_status, to_status, actor_id, note)
     VALUES ($1, $2::complaint_status, $3::complaint_status, $4, $5)`,
    [entry.complaintId, entry.fromStatus, entry.toStatus, entry.actorId, entry.note ?? null],
  );
}

/**
 * @param {number} complaintId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function getStatusHistory(complaintId) {
  const { rows } = await query(
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at,
            h.actor_id, u.name AS actor_name, u.role AS actor_role
       FROM complaint_status_history h
       LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.complaint_id = $1
      ORDER BY h.created_at ASC, h.id ASC`,
    [complaintId],
  );
  return rows;
}

/**
 * @typedef {Object} ComplaintFilters
 * @property {string[]} [statuses]
 * @property {number | null} [departmentId]
 * @property {number | null} [assignedTo]
 * @property {number | null} [createdBy]
 * @property {string | null} [category]
 * @property {string | null} [priority]
 * @property {string | null} [search]
 * @property {boolean} [openOnly]
 * @property {boolean} [unassignedOnly]
 * @property {boolean} [escalatedOnly]
 * @property {string | null} [from]  ISO date, inclusive lower bound on created_at.
 * @property {string | null} [to]    ISO date, exclusive upper bound on created_at.
 * @property {number | null} [handlerScopeUserId]
 *           When set, restricts results to complaints either assigned to this
 *           user or belonging to `handlerScopeDepartmentId`. This is the handler
 *           visibility rule; it needs OR semantics, which the other filters
 *           (all AND-ed) cannot express.
 * @property {number | null} [handlerScopeDepartmentId]
 */

/** Sortable columns, whitelisted so `sort` can never inject SQL. */
const SORTABLE = Object.freeze({
  created_at: 'c.created_at',
  updated_at: 'c.updated_at',
  last_activity_at: 'c.last_activity_at',
  priority: "array_position(ARRAY['low','medium','high','urgent']::text[], c.priority::text)",
  status: 'c.status',
});

/**
 * Paginated, filtered listing shared by every dashboard. RBAC scoping is
 * applied by the caller through `createdBy` / `departmentId` / `assignedTo`.
 *
 * @param {ComplaintFilters & { page?: number, pageSize?: number,
 *                             sort?: keyof typeof SORTABLE, order?: 'asc' | 'desc' }} options
 * @returns {Promise<{ rows: ComplaintRecord[], total: number, page: number, pageSize: number }>}
 */
export async function list(options = {}) {
  const page = Math.max(options.page ?? 1, 1);
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const sortColumn = SORTABLE[options.sort ?? 'created_at'] ?? SORTABLE.created_at;
  const direction = options.order === 'asc' ? 'ASC' : 'DESC';

  const statuses = (options.statuses ?? []).filter((s) =>
    /** @type {readonly string[]} */ (COMPLAINT_STATUSES).includes(s),
  );

  /** @type {unknown[]} */
  const params = [
    statuses.length > 0 ? statuses : null,          // $1
    options.departmentId ?? null,                    // $2
    options.assignedTo ?? null,                      // $3
    options.createdBy ?? null,                       // $4
    options.category ?? null,                        // $5
    options.priority ?? null,                        // $6
    options.search ? `%${options.search.trim()}%` : null, // $7
    options.openOnly ? [...OPEN_STATUSES] : null,    // $8
    options.unassignedOnly ?? false,                 // $9
    options.escalatedOnly ?? false,                  // $10
    options.from ?? null,                            // $11
    options.to ?? null,                              // $12
    options.handlerScopeUserId ?? null,              // $13
    options.handlerScopeDepartmentId ?? null,        // $14
  ];

  const where = `
    WHERE ($1::text[] IS NULL OR c.status::text = ANY($1))
      AND ($2::bigint IS NULL OR c.department_id = $2)
      AND ($3::bigint IS NULL OR c.assigned_to = $3)
      AND ($4::bigint IS NULL OR c.created_by = $4)
      AND ($5::text IS NULL OR c.category = $5)
      AND ($6::text IS NULL OR c.priority::text = $6)
      AND ($7::text IS NULL OR c.title ILIKE $7 OR c.description ILIKE $7)
      AND ($8::text[] IS NULL OR c.status::text = ANY($8))
      AND ($9::boolean IS NOT TRUE OR c.assigned_to IS NULL)
      AND ($10::boolean IS NOT TRUE OR c.escalation_level > 0)
      AND ($11::timestamptz IS NULL OR c.created_at >= $11)
      AND ($12::timestamptz IS NULL OR c.created_at < $12)
      AND ($13::bigint IS NULL OR c.assigned_to = $13 OR c.department_id = $14)
  `;

  const { rows } = await query(
    `${SELECT_COMPLAINT} ${where}
      ORDER BY ${sortColumn} ${direction}, c.id DESC
      LIMIT $15 OFFSET $16`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  const { rows: countRows } = await query(
    `SELECT count(*)::int AS total FROM complaints c ${where}`,
    params,
  );

  return { rows, total: countRows[0]?.total ?? 0, page, pageSize };
}

/**
 * Candidates for the escalation sweep: still open, and untouched for at least
 * the level-1 threshold. Ordered oldest-first so the most neglected complaints
 * are handled first if the batch limit truncates the set.
 *
 * Served by `idx_complaints_sla_sweep`.
 *
 * @param {{ idleSince: Date, limit: number }} options
 * @returns {Promise<ComplaintRecord[]>}
 */
export async function findSlaCandidates(options) {
  const { rows } = await query(
    `${SELECT_COMPLAINT}
      WHERE c.status NOT IN ('Resolved', 'Closed')
        AND c.last_activity_at <= $1
        AND c.escalation_level < 2
      ORDER BY c.last_activity_at ASC
      LIMIT $2`,
    [options.idleSince, options.limit],
  );
  return rows;
}
