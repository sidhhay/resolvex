/**
 * Aggregate queries behind the administrator analytics view.
 *
 * Every query accepts the same optional scope (department + date range) so the
 * dashboard's filter bar drives all of them consistently. Aggregation happens
 * in PostgreSQL rather than in Node: these are `count`/`percentile` over an
 * indexed table, and shipping rows to the API server to reduce them there would
 * be strictly worse.
 */
import { query } from '../config/db.js';

/**
 * @typedef {Object} AnalyticsScope
 * @property {number | null} [departmentId]
 * @property {string | null} [from]  ISO timestamp, inclusive.
 * @property {string | null} [to]    ISO timestamp, exclusive.
 */

/**
 * Shared predicate. $1 = departmentId, $2 = from, $3 = to.
 */
const SCOPE_PREDICATE = `
  ($1::bigint IS NULL OR c.department_id = $1)
  AND ($2::timestamptz IS NULL OR c.created_at >= $2)
  AND ($3::timestamptz IS NULL OR c.created_at < $3)
`;

/**
 * @param {AnalyticsScope} scope
 * @returns {[number | null, string | null, string | null]}
 */
function scopeParams(scope = {}) {
  return [scope.departmentId ?? null, scope.from ?? null, scope.to ?? null];
}

/**
 * Headline KPIs.
 *
 * `slaTargetDays` defines "on time": a complaint counts as compliant when it
 * reached Resolved within that many days of being filed. Complaints still open
 * past the target are counted separately as live breaches, so the number cannot
 * be flattered by simply never resolving anything.
 *
 * @param {AnalyticsScope & { slaTargetDays: number }} scope
 * @returns {Promise<Record<string, number | null>>}
 */
export async function overview(scope) {
  const { rows } = await query(
    `
    SELECT
      count(*)::int                                                          AS total,
      count(*) FILTER (WHERE c.status IN ('Submitted','Assigned','Investigating','Escalated'))::int AS open,
      count(*) FILTER (WHERE c.status = 'Submitted')::int                    AS unassigned,
      count(*) FILTER (WHERE c.status = 'Resolved')::int                     AS resolved,
      count(*) FILTER (WHERE c.status = 'Closed')::int                       AS closed,
      count(*) FILTER (WHERE c.escalation_level > 0)::int                    AS escalated,
      count(*) FILTER (WHERE c.escalation_level = 1)::int                    AS escalated_l1,
      count(*) FILTER (WHERE c.escalation_level = 2)::int                    AS escalated_l2,
      count(*) FILTER (WHERE c.assigned_at IS NOT NULL)::int                 AS ever_assigned,
      count(*) FILTER (WHERE c.resolved_at IS NOT NULL)::int                 AS ever_resolved,

      -- On-time resolutions, and live breaches among work still open.
      count(*) FILTER (
        WHERE c.resolved_at IS NOT NULL
          AND c.resolved_at - c.created_at <= make_interval(secs => $4)
      )::int                                                                 AS resolved_on_time,
      count(*) FILTER (
        WHERE c.resolved_at IS NULL
          AND c.status NOT IN ('Resolved','Closed')
          AND now() - c.created_at > make_interval(secs => $4)
      )::int                                                                 AS open_past_target,

      -- Time to assignment / resolution, in seconds. percentile_cont skips NULLs.
      avg(EXTRACT(EPOCH FROM (c.assigned_at - c.created_at)))                AS avg_assignment_seconds,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (c.assigned_at - c.created_at))
      )                                                                      AS median_assignment_seconds,
      avg(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)))                AS avg_resolution_seconds,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))
      )                                                                      AS median_resolution_seconds
    FROM complaints c
    WHERE ${SCOPE_PREDICATE}
    `,
    [...scopeParams(scope), scope.slaTargetDays * 86_400],
  );

  const row = rows[0] ?? {};
  const compliantDenominator = (row.ever_resolved ?? 0) + (row.open_past_target ?? 0);

  return {
    total: row.total ?? 0,
    open: row.open ?? 0,
    unassigned: row.unassigned ?? 0,
    resolved: row.resolved ?? 0,
    closed: row.closed ?? 0,
    escalated: row.escalated ?? 0,
    escalatedLevel1: row.escalated_l1 ?? 0,
    escalatedLevel2: row.escalated_l2 ?? 0,
    everAssigned: row.ever_assigned ?? 0,
    everResolved: row.ever_resolved ?? 0,
    resolvedOnTime: row.resolved_on_time ?? 0,
    openPastTarget: row.open_past_target ?? 0,
    // Share of complaints that either met the target or are still inside it.
    slaComplianceRate:
      compliantDenominator === 0 ? null : (row.resolved_on_time ?? 0) / compliantDenominator,
    escalationRate: row.total ? (row.escalated ?? 0) / row.total : null,
    avgAssignmentSeconds: numeric(row.avg_assignment_seconds),
    medianAssignmentSeconds: numeric(row.median_assignment_seconds),
    avgResolutionSeconds: numeric(row.avg_resolution_seconds),
    medianResolutionSeconds: numeric(row.median_resolution_seconds),
  };
}

/**
 * Complaint counts per department, split into the buckets the bar chart draws.
 * @param {AnalyticsScope} scope
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function byDepartment(scope = {}) {
  const { rows } = await query(
    `
    SELECT
      d.id                                                                   AS department_id,
      d.name                                                                 AS department_name,
      count(c.id)::int                                                       AS total,
      count(c.id) FILTER (WHERE c.status IN ('Submitted','Assigned','Investigating'))::int AS open,
      count(c.id) FILTER (WHERE c.status = 'Escalated')::int                 AS escalated,
      count(c.id) FILTER (WHERE c.status IN ('Resolved','Closed'))::int      AS done,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))
      )                                                                      AS median_resolution_seconds
    FROM departments d
    LEFT JOIN complaints c ON c.department_id = d.id AND ${SCOPE_PREDICATE}
    GROUP BY d.id, d.name
    HAVING count(c.id) > 0
    ORDER BY count(c.id) DESC, d.name ASC
    `,
    scopeParams(scope),
  );
  return rows.map((row) => ({
    ...row,
    median_resolution_seconds: numeric(row.median_resolution_seconds),
  }));
}

/**
 * Counts per status — the distribution chart.
 * @param {AnalyticsScope} scope
 * @returns {Promise<Array<{ status: string, count: number }>>}
 */
export async function byStatus(scope = {}) {
  const { rows } = await query(
    `SELECT c.status::text AS status, count(*)::int AS count
       FROM complaints c
      WHERE ${SCOPE_PREDICATE}
      GROUP BY c.status
      ORDER BY count(*) DESC`,
    scopeParams(scope),
  );
  return rows;
}

/**
 * Counts per predicted category, with the average classifier confidence —
 * the audit trail for the AI routing layer.
 * @param {AnalyticsScope} scope
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function byCategory(scope = {}) {
  const { rows } = await query(
    `SELECT c.category,
            count(*)::int AS count,
            avg(c.ai_confidence) AS avg_confidence,
            count(*) FILTER (WHERE c.ai_strategy = 'keyword')::int AS keyword_routed
       FROM complaints c
      WHERE ${SCOPE_PREDICATE}
      GROUP BY c.category
      ORDER BY count(*) DESC`,
    scopeParams(scope),
  );
  return rows.map((row) => ({ ...row, avg_confidence: numeric(row.avg_confidence) }));
}

/**
 * Daily series for the trend charts: complaints filed, complaints resolved and
 * escalations raised, per day, with no gaps.
 *
 * `generate_series` supplies every day in the window so the chart's x-axis is
 * continuous even on days with no activity — otherwise a quiet week would
 * silently compress the timeline and misrepresent the trend.
 *
 * @param {AnalyticsScope & { days?: number }} scope
 * @returns {Promise<Array<{ day: string, created: number, resolved: number, escalated_l1: number, escalated_l2: number }>>}
 */
export async function dailyTrend(scope = {}) {
  const days = Math.min(Math.max(scope.days ?? 30, 1), 365);
  const { rows } = await query(
    `
    WITH calendar AS (
      SELECT generate_series(
               date_trunc('day', now()) - make_interval(days => $2 - 1),
               date_trunc('day', now()),
               interval '1 day'
             ) AS day
    ),
    created AS (
      SELECT date_trunc('day', c.created_at) AS day, count(*)::int AS n
        FROM complaints c
       WHERE ($1::bigint IS NULL OR c.department_id = $1)
         AND c.created_at >= date_trunc('day', now()) - make_interval(days => $2 - 1)
       GROUP BY 1
    ),
    resolved AS (
      SELECT date_trunc('day', c.resolved_at) AS day, count(*)::int AS n
        FROM complaints c
       WHERE c.resolved_at IS NOT NULL
         AND ($1::bigint IS NULL OR c.department_id = $1)
         AND c.resolved_at >= date_trunc('day', now()) - make_interval(days => $2 - 1)
       GROUP BY 1
    ),
    escalated AS (
      SELECT date_trunc('day', e."timestamp") AS day,
             count(*) FILTER (WHERE e.level = 1)::int AS l1,
             count(*) FILTER (WHERE e.level = 2)::int AS l2
        FROM escalations e
        JOIN complaints c ON c.id = e.complaint_id
       WHERE ($1::bigint IS NULL OR c.department_id = $1)
         AND e."timestamp" >= date_trunc('day', now()) - make_interval(days => $2 - 1)
       GROUP BY 1
    )
    SELECT to_char(cal.day, 'YYYY-MM-DD')       AS day,
           coalesce(cr.n, 0)                    AS created,
           coalesce(rs.n, 0)                    AS resolved,
           coalesce(es.l1, 0)                   AS escalated_l1,
           coalesce(es.l2, 0)                   AS escalated_l2
      FROM calendar cal
      LEFT JOIN created   cr ON cr.day = cal.day
      LEFT JOIN resolved  rs ON rs.day = cal.day
      LEFT JOIN escalated es ON es.day = cal.day
     ORDER BY cal.day ASC
    `,
    [scope.departmentId ?? null, days],
  );
  return rows;
}

/**
 * Which strategy routed recent complaints — makes a silent LLM outage visible
 * as a spike in keyword-routed tickets.
 * @param {AnalyticsScope} scope
 * @returns {Promise<Array<{ strategy: string, count: number, avg_confidence: number | null }>>}
 */
export async function classifierBreakdown(scope = {}) {
  const { rows } = await query(
    `SELECT coalesce(c.ai_strategy, 'unknown') AS strategy,
            count(*)::int AS count,
            avg(c.ai_confidence) AS avg_confidence
       FROM complaints c
      WHERE ${SCOPE_PREDICATE}
      GROUP BY 1
      ORDER BY count(*) DESC`,
    scopeParams(scope),
  );
  return rows.map((row) => ({ ...row, avg_confidence: numeric(row.avg_confidence) }));
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function numeric(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
