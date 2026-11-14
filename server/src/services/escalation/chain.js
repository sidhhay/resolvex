/**
 * ============================================================================
 * DESIGN PATTERN #3 — CHAIN OF RESPONSIBILITY
 * ============================================================================
 * Each complaint the SLA sweep picks up is passed along a chain of handlers.
 * Every handler answers exactly one question about the complaint and either
 * takes responsibility (returning a decision) or passes it on. No handler knows
 * what comes after it, so the escalation policy can be reordered, extended
 * (a level 3 to the ombudsman, a weekend-aware handler) or shortened without
 * touching the others.
 *
 *   TerminalState ─▶ MaxLevel ─▶ RecentActivity ─▶ Level2Dean ─▶ Level1Hod ─▶ NoAction
 *      "closed"      "already      "still inside     ">= 5 days     ">= 3 days     terminal
 *       work"         at top"        its SLA"          idle"          idle"       default
 *
 * Note the deliberate ordering of the two escalation handlers: Level 2 is
 * evaluated *before* Level 1. A complaint that has sat idle past the five-day
 * mark without ever being escalated (because the job was down, say) goes
 * straight to the Dean rather than crawling up one rung per sweep. The HOD is
 * still notified — `buildAudience` always includes them.
 *
 * The chain is pure decision-making: it performs no writes. Executing the
 * decision belongs to escalationService.js, which keeps this file trivially
 * unit-testable with no database.
 * ============================================================================
 */

/** @typedef {import('../../repositories/complaintRepo.js').ComplaintRecord} ComplaintRecord */
/** @typedef {import('../../repositories/userRepo.js').UserRecord} UserRecord */

/**
 * @typedef {Object} EscalationContext
 * @property {ComplaintRecord} complaint
 * @property {number} idleDays          Days since `last_activity_at`.
 * @property {{ level1Days: number, level2Days: number }} thresholds
 * @property {(complaint: ComplaintRecord) => Promise<UserRecord | null>} resolveHod
 *           Level-1 target: the head of the complaint's department.
 * @property {() => Promise<UserRecord | null>} resolveAuthority
 *           Level-2 target: the Dean / Director.
 */

/**
 * @typedef {Object} EscalationDecision
 * @property {'escalate' | 'skip' | 'none'} action
 * @property {string} reason        Stored verbatim in `escalations.reason`.
 * @property {1 | 2} [level]
 * @property {UserRecord | null} [target]
 * @property {string} handledBy     Which link in the chain decided.
 */

/** Abstract link. Subclasses implement `evaluate`. */
export class EscalationHandler {
  constructor() {
    /** @type {EscalationHandler | null} */
    this.next = null;
  }

  /** @returns {string} */
  get name() {
    return this.constructor.name;
  }

  /**
   * Links `handler` after this one and returns it, so a chain reads as
   * `a.setNext(b).setNext(c)`.
   * @param {EscalationHandler} handler
   * @returns {EscalationHandler}
   */
  setNext(handler) {
    this.next = handler;
    return handler;
  }

  /**
   * @param {EscalationContext} context
   * @returns {Promise<EscalationDecision>}
   */
  async handle(context) {
    const decision = await this.evaluate(context);
    if (decision) return { ...decision, handledBy: this.name };
    if (this.next) return this.next.handle(context);
    return { action: 'none', reason: 'No handler claimed this complaint.', handledBy: this.name };
  }

  /**
   * Return a decision to take responsibility, or null to pass along.
   * @param {EscalationContext} _context
   * @returns {Promise<Omit<EscalationDecision, 'handledBy'> | null>}
   */
  async evaluate(_context) {
    return null;
  }
}

/** Work that is finished has no SLA left to breach. */
export class TerminalStateHandler extends EscalationHandler {
  /**
   * @param {EscalationContext} context
   * @returns {Promise<Omit<EscalationDecision, 'handledBy'> | null>}
   */
  async evaluate({ complaint }) {
    if (complaint.status === 'Resolved' || complaint.status === 'Closed') {
      return { action: 'skip', reason: `Complaint is ${complaint.status}; no SLA applies.` };
    }
    return null;
  }
}

/** Level 2 is the top of the hierarchy — there is nowhere further to go. */
export class MaxLevelHandler extends EscalationHandler {
  /**
   * @param {EscalationContext} context
   * @returns {Promise<Omit<EscalationDecision, 'handledBy'> | null>}
   */
  async evaluate({ complaint }) {
    if (complaint.escalation_level >= 2) {
      return {
        action: 'skip',
        reason: 'Already escalated to the highest level; awaiting resolution.',
      };
    }
    return null;
  }
}

/** Inside its service window — nothing to do yet. */
export class RecentActivityHandler extends EscalationHandler {
  /**
   * @param {EscalationContext} context
   * @returns {Promise<Omit<EscalationDecision, 'handledBy'> | null>}
   */
  async evaluate({ idleDays, thresholds }) {
    if (idleDays < thresholds.level1Days) {
      return {
        action: 'skip',
        reason: `Last activity ${idleDays.toFixed(1)}d ago, inside the ${thresholds.level1Days}d service window.`,
      };
    }
    return null;
  }
}

/** Second tier: idle past the level-2 threshold → Dean / Director. */
export class Level2DeanHandler extends EscalationHandler {
  /**
   * @param {EscalationContext} context
   * @returns {Promise<Omit<EscalationDecision, 'handledBy'> | null>}
   */
  async evaluate({ complaint, idleDays, thresholds, resolveAuthority }) {
    if (idleDays < thresholds.level2Days || complaint.escalation_level >= 2) return null;

    const target = await resolveAuthority();
    return {
      action: 'escalate',
      level: 2,
      target,
      reason:
        `No activity for ${idleDays.toFixed(1)} days, exceeding the ${thresholds.level2Days}-day ` +
        `threshold. Escalated to the Dean / Director` +
        (complaint.escalation_level === 0
          ? ' (the level-1 window elapsed before this sweep ran).'
          : ' after the department-level escalation went unanswered.'),
    };
  }
}

/** First tier: idle past the level-1 threshold → Head of Department. */
export class Level1HodHandler extends EscalationHandler {
  /**
   * @param {EscalationContext} context
   * @returns {Promise<Omit<EscalationDecision, 'handledBy'> | null>}
   */
  async evaluate({ complaint, idleDays, thresholds, resolveHod }) {
    if (idleDays < thresholds.level1Days || complaint.escalation_level >= 1) return null;

    const target = await resolveHod(complaint);
    return {
      action: 'escalate',
      level: 1,
      target,
      reason:
        `No activity for ${idleDays.toFixed(1)} days, exceeding the ${thresholds.level1Days}-day ` +
        `threshold. Escalated to the Head of ${complaint.department_name ?? 'Department'}.`,
    };
  }
}

/** Terminal link: makes "nothing applies" an explicit, logged outcome. */
export class NoActionHandler extends EscalationHandler {
  /** @returns {Promise<Omit<EscalationDecision, 'handledBy'>>} */
  async evaluate() {
    return { action: 'none', reason: 'No escalation rule matched.' };
  }
}

/**
 * Assembles the default policy chain.
 * @returns {EscalationHandler} the head of the chain.
 */
export function buildEscalationChain() {
  const head = new TerminalStateHandler();
  head
    .setNext(new MaxLevelHandler())
    .setNext(new RecentActivityHandler())
    .setNext(new Level2DeanHandler())
    .setNext(new Level1HodHandler())
    .setNext(new NoActionHandler());
  return head;
}

/**
 * @param {ComplaintRecord} complaint
 * @param {Date} now
 * @returns {number} days since the last meaningful activity.
 */
export function idleDaysFor(complaint, now = new Date()) {
  const last = new Date(complaint.last_activity_at).getTime();
  return Math.max(0, (now.getTime() - last) / 86_400_000);
}
