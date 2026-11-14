/**
 * Administrator analytics.
 *
 * Read-only aggregates: SLA compliance, time-to-assignment, escalation history
 * and classifier health. Administrator-gated at the route level.
 */
import { config } from '../config/env.js';
import * as analyticsRepo from '../repositories/analyticsRepo.js';
import * as escalationRepo from '../repositories/escalationRepo.js';
import { runEscalationSweep } from '../services/escalation/escalationService.js';

/**
 * GET /api/analytics/overview
 *
 * Returns everything the dashboard renders in one round trip — six charts
 * firing six requests would produce a visibly staggered page for no benefit.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function overview(req, res) {
  const { departmentId, from, to, days } = /** @type {any} */ (req.validated ?? {});
  const scope = { departmentId: departmentId ?? null, from: from ?? null, to: to ?? null };

  const [summary, byStatus, byDepartment, byCategory, trend, classifier] = await Promise.all([
    analyticsRepo.overview({ ...scope, slaTargetDays: config.sla.resolutionTargetDays }),
    analyticsRepo.byStatus(scope),
    analyticsRepo.byDepartment(scope),
    analyticsRepo.byCategory(scope),
    analyticsRepo.dailyTrend({ departmentId: scope.departmentId, days: days ?? 30 }),
    analyticsRepo.classifierBreakdown(scope),
  ]);

  res.json({
    summary,
    byStatus,
    byDepartment,
    byCategory,
    trend,
    classifier,
    thresholds: {
      level1Days: config.sla.level1Days,
      level2Days: config.sla.level2Days,
      resolutionTargetDays: config.sla.resolutionTargetDays,
    },
  });
}

/**
 * GET /api/analytics/escalations — the escalation log.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function escalations(req, res) {
  const { level, departmentId, page, pageSize } = /** @type {any} */ (req.validated ?? {});
  const size = pageSize ?? 25;
  const current = page ?? 1;

  const result = await escalationRepo.listRecent({
    level: level ?? null,
    departmentId: departmentId ?? null,
    limit: size,
    offset: (current - 1) * size,
  });

  res.json({
    escalations: result.rows,
    pagination: {
      page: current,
      pageSize: size,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / size)),
    },
  });
}

/**
 * POST /api/analytics/escalations/run
 *
 * Triggers the SLA sweep on demand. The scheduled job is the normal path; this
 * exists so an administrator can verify the policy immediately after changing a
 * threshold, and so the flow is demonstrable without waiting for the cron.
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
export async function runSweep(_req, res) {
  res.json({ report: await runEscalationSweep() });
}
