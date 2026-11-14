/**
 * Runs the escalation policy.
 *
 * The Chain of Responsibility (chain.js) decides; this module executes: it
 * fetches candidates, walks each one through the chain, and turns an "escalate"
 * decision into a real state transition plus an escalation record — inside a
 * single transaction, via `transitionComplaint`.
 *
 * Safety properties:
 *   • Idempotent. UNIQUE (complaint_id, level) means a second run for the same
 *     level rolls back rather than duplicating escalations or e-mails.
 *   • Bounded. Each sweep reads at most ESCALATION_BATCH_SIZE rows.
 *   • Isolated. One complaint failing does not abort the sweep.
 */
import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ConflictError } from '../../domain/errors.js';
import * as complaintRepo from '../../repositories/complaintRepo.js';
import * as departmentRepo from '../../repositories/departmentRepo.js';
import * as userRepo from '../../repositories/userRepo.js';
import { SYSTEM_ACTOR, transitionComplaint } from '../complaintService.js';
import { buildEscalationChain, idleDaysFor } from './chain.js';

/** @typedef {import('../../repositories/complaintRepo.js').ComplaintRecord} ComplaintRecord */
/** @typedef {import('./chain.js').EscalationDecision} EscalationDecision */

/**
 * @typedef {Object} SweepReport
 * @property {string} startedAt
 * @property {number} durationMs
 * @property {number} examined
 * @property {number} escalated
 * @property {number} skipped
 * @property {number} failed
 * @property {Array<{ complaintId: number, level?: number, target?: string | null,
 *                    handledBy: string, action: string, reason: string }>} decisions
 */

/**
 * Resolves the head of a complaint's department (level-1 target).
 * @param {ComplaintRecord} complaint
 * @returns {Promise<import('../../repositories/userRepo.js').UserRecord | null>}
 */
async function resolveHod(complaint) {
  if (complaint.department_hod_id) {
    const hod = await userRepo.findById(complaint.department_hod_id);
    if (hod?.is_active) return hod;
  }
  if (complaint.department_id) {
    const department = await departmentRepo.findById(complaint.department_id);
    if (department?.hod_id) {
      const hod = await userRepo.findById(department.hod_id);
      if (hod?.is_active) return hod;
    }
  }
  // A department with no head must not stall the escalation: hand it to the
  // institute-level authority instead of dropping the complaint on the floor.
  logger.warn('No active HOD for department; falling back to the escalation authority', {
    complaintId: complaint.id,
    departmentId: complaint.department_id,
  });
  return userRepo.findEscalationAuthority(config.sla.level2Email);
}

/** @returns {Promise<import('../../repositories/userRepo.js').UserRecord | null>} */
function resolveAuthority() {
  return userRepo.findEscalationAuthority(config.sla.level2Email);
}

/**
 * Examines one complaint and, if the chain says so, escalates it.
 *
 * @param {ComplaintRecord} complaint
 * @param {{ now?: Date, chain?: import('./chain.js').EscalationHandler }} [options]
 * @returns {Promise<EscalationDecision & { executed: boolean }>}
 */
export async function evaluateComplaint(complaint, options = {}) {
  const now = options.now ?? new Date();
  const chain = options.chain ?? buildEscalationChain();

  const decision = await chain.handle({
    complaint,
    idleDays: idleDaysFor(complaint, now),
    thresholds: { level1Days: config.sla.level1Days, level2Days: config.sla.level2Days },
    resolveHod,
    resolveAuthority,
  });

  if (decision.action !== 'escalate' || !decision.level) {
    return { ...decision, executed: false };
  }

  try {
    await transitionComplaint({
      complaintId: complaint.id,
      to: 'Escalated',
      user: SYSTEM_ACTOR,
      payload: {
        reason: decision.reason,
        escalationLevel: decision.level,
        // Reassigning to the escalation target is what makes the escalation
        // actionable: it lands in that person's queue, not just their inbox.
        assignedTo: decision.target?.id ?? complaint.assigned_to ?? null,
      },
      escalation: {
        level: decision.level,
        reason: decision.reason,
        escalatedTo: decision.target?.id ?? null,
      },
    });
    return { ...decision, executed: true };
  } catch (error) {
    if (error instanceof ConflictError) {
      // Another worker (or an earlier overlapping run) already escalated this
      // complaint to this level. Expected under concurrency, not a failure.
      logger.debug('Escalation already recorded; skipping', {
        complaintId: complaint.id,
        level: decision.level,
      });
      return { ...decision, action: 'skip', reason: 'Already escalated at this level.', executed: false };
    }
    throw error;
  }
}

/**
 * One full pass over every complaint that may have breached its SLA.
 *
 * @param {{ now?: Date, limit?: number, chain?: import('./chain.js').EscalationHandler }} [options]
 * @returns {Promise<SweepReport>}
 */
export async function runEscalationSweep(options = {}) {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const chain = options.chain ?? buildEscalationChain();
  const limit = options.limit ?? config.sla.sweepBatchSize;

  // Only rows already past the *first* threshold are worth loading; the chain
  // re-checks precisely, but this keeps the batch small and index-served.
  const idleSince = new Date(now.getTime() - config.sla.level1Days * 86_400_000);
  const candidates = await complaintRepo.findSlaCandidates({ idleSince, limit });

  /** @type {SweepReport} */
  const report = {
    startedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    examined: candidates.length,
    escalated: 0,
    skipped: 0,
    failed: 0,
    decisions: [],
  };

  for (const complaint of candidates) {
    try {
      const decision = await evaluateComplaint(complaint, { now, chain });
      if (decision.executed) report.escalated += 1;
      else report.skipped += 1;

      report.decisions.push({
        complaintId: complaint.id,
        level: decision.level,
        target: decision.target?.email ?? null,
        handledBy: decision.handledBy,
        action: decision.executed ? 'escalate' : decision.action,
        reason: decision.reason,
      });
    } catch (error) {
      // One bad complaint must not abort the sweep for everyone else.
      report.failed += 1;
      logger.error('Escalation failed for a complaint', { complaintId: complaint.id, error });
      report.decisions.push({
        complaintId: complaint.id,
        handledBy: 'error',
        action: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  report.durationMs = Date.now() - startedAt;

  const summary = {
    examined: report.examined,
    escalated: report.escalated,
    skipped: report.skipped,
    failed: report.failed,
    durationMs: report.durationMs,
  };
  if (report.escalated > 0 || report.failed > 0) logger.info('SLA sweep complete', summary);
  else logger.debug('SLA sweep complete — nothing to escalate', summary);

  return report;
}
