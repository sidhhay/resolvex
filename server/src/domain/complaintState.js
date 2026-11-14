/**
 * ============================================================================
 * DESIGN PATTERN #1 — STATE
 * ============================================================================
 * Every legal move a complaint can make lives here, and nowhere else.
 *
 * Each status is represented by a class deriving from `ComplaintState`. The
 * class owns three things about the status it represents:
 *
 *   1. which statuses are reachable from it,
 *   2. who is allowed to make each of those moves,
 *   3. what extra information each move demands.
 *
 * Controllers never branch on `complaint.status`. They ask the state object
 * whether a move is legal (`assertCanTransition`) and then what to persist
 * (`buildPatch`). Adding a status means adding a class and registering it —
 * no `if (status === ...)` chain anywhere in the codebase has to change.
 *
 * The lifecycle:
 *
 *      Submitted ──▶ Assigned ──▶ Investigating ──▶ Resolved ──▶ Closed
 *          │            │  ▲            │              │
 *          │            ▼  │            │              └──▶ Investigating (reopen)
 *          └────────▶ Escalated ◀───────┘
 *
 * `Escalated` is entered only by the SLA sweep (or an admin) and is a working
 * state, not a dead end — the escalation target continues the investigation
 * from there. `Closed` is the single terminal state.
 * ============================================================================
 */
import { ForbiddenError, InvalidTransitionError } from './errors.js';

/**
 * @typedef {'Submitted' | 'Assigned' | 'Investigating' | 'Resolved' | 'Closed' | 'Escalated'} ComplaintStatus
 */

/**
 * The caller attempting the transition. `isCreator` / `isAssignee` /
 * `isDepartmentMember` are resolved once by the service layer so that the state
 * machine can answer authorisation questions without touching the database.
 *
 * @typedef {Object} Actor
 * @property {number | null} id            Null for the system (cron job).
 * @property {'student' | 'handler' | 'admin' | 'system'} role
 * @property {boolean} [isCreator]         Actor filed this complaint.
 * @property {boolean} [isAssignee]        Complaint is currently assigned to actor.
 * @property {boolean} [isDepartmentMember] Actor belongs to the complaint's department.
 */

/**
 * The subset of a complaint row the state machine reasons about.
 *
 * @typedef {Object} ComplaintSnapshot
 * @property {number} id
 * @property {ComplaintStatus} status
 * @property {number | null} assigned_to
 * @property {number | null} department_id
 * @property {number} escalation_level
 * @property {Date | string | null} assigned_at
 * @property {Date | string | null} resolved_at
 */

/**
 * Extra information a particular transition needs.
 *
 * @typedef {Object} TransitionPayload
 * @property {number | null} [assignedTo]
 * @property {number | null} [departmentId]
 * @property {string} [resolutionNote]
 * @property {string} [closureNote]
 * @property {string} [reason]
 * @property {1 | 2} [escalationLevel]
 */

/**
 * @typedef {Object} TransitionContext
 * @property {ComplaintSnapshot} complaint
 * @property {Actor} actor
 * @property {ComplaintStatus} to
 * @property {TransitionPayload} payload
 */

/**
 * A single edge in the state graph.
 *
 * @typedef {Object} TransitionRule
 * @property {ReadonlyArray<Actor['role']>} roles  Roles permitted to attempt it.
 * @property {string} label            Verb shown on the handler/citizen UI button.
 * @property {string[]} [requires]     Payload fields the UI must collect first.
 * @property {(ctx: TransitionContext) => void} [guard]
 *           Extra checks. Throws ForbiddenError (who) or InvalidTransitionError (what).
 */

const MIN_NOTE_LENGTH = 10;

/**
 * @param {TransitionPayload} payload
 * @param {'resolutionNote' | 'closureNote' | 'reason'} field
 * @param {string} humanName
 */
function requireNote(payload, field, humanName) {
  const value = (payload[field] ?? '').trim();
  if (value.length < MIN_NOTE_LENGTH) {
    throw new InvalidTransitionError(
      `${humanName} is required and must be at least ${MIN_NOTE_LENGTH} characters.`,
      { field },
    );
  }
}

/**
 * A handler may only act on complaints they own or that belong to their
 * department; admins and the system are unrestricted.
 * @param {TransitionContext} ctx
 */
function requireHandlerScope({ actor }) {
  if (actor.role === 'admin' || actor.role === 'system') return;
  if (actor.isAssignee || actor.isDepartmentMember) return;
  throw new ForbiddenError('This complaint belongs to another department.');
}

/**
 * Only the person who filed the complaint (or an administrator) may accept or
 * reject its outcome. This is the accountability guarantee of the system: a
 * handler cannot unilaterally declare a grievance closed.
 * @param {TransitionContext} ctx
 */
function requireCreatorOrAdmin({ actor }) {
  if (actor.role === 'admin' || actor.role === 'system') return;
  if (actor.isCreator) return;
  throw new ForbiddenError('Only the complainant can accept or reopen this outcome.');
}

/** Base class. Concrete states override `name`, `isTerminal` and `transitions`. */
export class ComplaintState {
  /** @returns {ComplaintStatus} */
  get name() {
    throw new Error('ComplaintState subclasses must define `name`');
  }

  /** @returns {boolean} */
  get isTerminal() {
    return false;
  }

  /**
   * The outgoing edges of this state, keyed by destination status.
   * @returns {Readonly<Partial<Record<ComplaintStatus, TransitionRule>>>}
   */
  get transitions() {
    return {};
  }

  /** @returns {ComplaintStatus[]} */
  get reachableStatuses() {
    return /** @type {ComplaintStatus[]} */ (Object.keys(this.transitions));
  }

  /**
   * @param {ComplaintStatus} to
   * @returns {boolean}
   */
  can(to) {
    return Boolean(this.transitions[to]);
  }

  /**
   * Throws unless `ctx.actor` may move `ctx.complaint` into `ctx.to` right now.
   * @param {TransitionContext} ctx
   * @returns {TransitionRule}
   */
  assertCanTransition(ctx) {
    const rule = this.transitions[ctx.to];
    if (!rule) {
      const options = this.reachableStatuses;
      throw new InvalidTransitionError(
        this.isTerminal
          ? `This complaint is ${this.name} and can no longer be changed.`
          : `Cannot move a complaint from ${this.name} to ${ctx.to}.`,
        { from: this.name, to: ctx.to, allowed: options },
      );
    }
    if (!rule.roles.includes(ctx.actor.role)) {
      throw new ForbiddenError(`Your role (${ctx.actor.role}) cannot perform this action.`);
    }
    rule.guard?.(ctx);
    return rule;
  }

  /**
   * Everything this actor could legitimately do next — drives the one-click
   * action buttons on the handler dashboard and the citizen portal.
   * @param {ComplaintSnapshot} complaint
   * @param {Actor} actor
   * @returns {Array<{ to: ComplaintStatus, label: string, requires: string[] }>}
   */
  availableTransitions(complaint, actor) {
    /** @type {Array<{ to: ComplaintStatus, label: string, requires: string[] }>} */
    const available = [];
    for (const [to, rule] of Object.entries(this.transitions)) {
      const target = /** @type {ComplaintStatus} */ (to);
      if (!rule || !rule.roles.includes(actor.role)) continue;
      try {
        // Probe the guard with a payload that satisfies every declared
        // requirement, so we test *authorisation* rather than form completeness.
        rule.guard?.({
          complaint,
          actor,
          to: target,
          payload: probePayload(rule, complaint),
        });
      } catch {
        continue;
      }
      available.push({ to: target, label: rule.label, requires: rule.requires ?? [] });
    }
    return available;
  }
}

/**
 * Builds a payload that trivially satisfies a rule's field requirements, used
 * only when probing which buttons to show.
 * @param {TransitionRule} rule
 * @param {ComplaintSnapshot} complaint
 * @returns {TransitionPayload}
 */
function probePayload(rule, complaint) {
  /** @type {TransitionPayload} */
  const payload = {};
  for (const field of rule.requires ?? []) {
    // -1 can never be a real user id, so the probe always reads as a genuine
    // change of owner and tests authorisation rather than form completeness.
    if (field === 'assignedTo') payload.assignedTo = -1;
    else if (field === 'escalationLevel') {
      payload.escalationLevel = /** @type {1 | 2} */ (Math.min(2, complaint.escalation_level + 1));
    } else Object.assign(payload, { [field]: 'placeholder value' });
  }
  return payload;
}

/* -------------------------------------------------------------------------- */
/* Concrete states                                                            */
/* -------------------------------------------------------------------------- */

/** Initial state: filed by a student, classified by AI, not yet picked up. */
class SubmittedState extends ComplaintState {
  get name() {
    return /** @type {ComplaintStatus} */ ('Submitted');
  }

  /** @returns {Readonly<Partial<Record<ComplaintStatus, TransitionRule>>>} */
  get transitions() {
    return ({
      Assigned: {
        roles: ['handler', 'admin'],
        label: 'Assign to handler',
        requires: ['assignedTo'],
        guard: (ctx) => {
          requireHandlerScope(ctx);
          if (!ctx.payload.assignedTo) {
            throw new InvalidTransitionError('Select the handler who will own this complaint.', {
              field: 'assignedTo',
            });
          }
        },
      },
      Escalated: {
        roles: ['system', 'admin'],
        label: 'Escalate',
        requires: ['reason', 'escalationLevel'],
        guard: (ctx) => assertEscalation(ctx),
      },
      Closed: {
        // A complainant may withdraw; an administrator may reject out of scope.
        roles: ['student', 'admin'],
        label: 'Withdraw complaint',
        requires: ['closureNote'],
        guard: (ctx) => {
          requireCreatorOrAdmin(ctx);
          requireNote(ctx.payload, 'closureNote', 'A reason for closing');
        },
      },
    });
  }
}

/** A handler owns the complaint but has not started work. */
class AssignedState extends ComplaintState {
  get name() {
    return /** @type {ComplaintStatus} */ ('Assigned');
  }

  /** @returns {Readonly<Partial<Record<ComplaintStatus, TransitionRule>>>} */
  get transitions() {
    return ({
      Investigating: {
        roles: ['handler', 'admin'],
        label: 'Start investigation',
        guard: requireHandlerScope,
      },
      Assigned: {
        // Self-transition = reassignment (new owner and/or new department).
        // Modelling it as an edge keeps it inside the audit trail.
        roles: ['handler', 'admin'],
        label: 'Reassign',
        requires: ['assignedTo'],
        guard: (ctx) => {
          requireHandlerScope(ctx);
          assertReassignmentChangesSomething(ctx);
        },
      },
      Resolved: {
        // Trivial complaints are fixed on the spot; forcing a ceremonial
        // Investigating hop would only add noise to the timeline.
        roles: ['handler', 'admin'],
        label: 'Mark resolved',
        requires: ['resolutionNote'],
        guard: (ctx) => {
          requireHandlerScope(ctx);
          requireNote(ctx.payload, 'resolutionNote', 'A resolution note');
        },
      },
      Submitted: {
        roles: ['handler', 'admin'],
        label: 'Return to queue',
        guard: requireHandlerScope,
      },
      Escalated: {
        roles: ['system', 'admin'],
        label: 'Escalate',
        requires: ['reason', 'escalationLevel'],
        guard: (ctx) => assertEscalation(ctx),
      },
    });
  }
}

/** Work is actively in progress. */
class InvestigatingState extends ComplaintState {
  get name() {
    return /** @type {ComplaintStatus} */ ('Investigating');
  }

  /** @returns {Readonly<Partial<Record<ComplaintStatus, TransitionRule>>>} */
  get transitions() {
    return ({
      Resolved: {
        roles: ['handler', 'admin'],
        label: 'Mark resolved',
        requires: ['resolutionNote'],
        guard: (ctx) => {
          requireHandlerScope(ctx);
          requireNote(ctx.payload, 'resolutionNote', 'A resolution note');
        },
      },
      Assigned: {
        roles: ['handler', 'admin'],
        label: 'Hand over',
        requires: ['assignedTo'],
        guard: (ctx) => {
          requireHandlerScope(ctx);
          assertReassignmentChangesSomething(ctx);
        },
      },
      Escalated: {
        roles: ['system', 'admin'],
        label: 'Escalate',
        requires: ['reason', 'escalationLevel'],
        guard: (ctx) => assertEscalation(ctx),
      },
    });
  }
}

/**
 * Breached its SLA and was handed up the hierarchy. Still a working state — the
 * HOD or Dean now owns it and drives it to resolution from here.
 */
class EscalatedState extends ComplaintState {
  get name() {
    return /** @type {ComplaintStatus} */ ('Escalated');
  }

  /** @returns {Readonly<Partial<Record<ComplaintStatus, TransitionRule>>>} */
  get transitions() {
    return ({
      Assigned: {
        roles: ['handler', 'admin'],
        label: 'Assign to handler',
        requires: ['assignedTo'],
        guard: (ctx) => {
          requireHandlerScope(ctx);
          if (!ctx.payload.assignedTo) {
            throw new InvalidTransitionError('Select the handler who will own this complaint.', {
              field: 'assignedTo',
            });
          }
        },
      },
      Investigating: {
        roles: ['handler', 'admin'],
        label: 'Start investigation',
        guard: requireHandlerScope,
      },
      Resolved: {
        roles: ['handler', 'admin'],
        label: 'Mark resolved',
        requires: ['resolutionNote'],
        guard: (ctx) => {
          requireHandlerScope(ctx);
          requireNote(ctx.payload, 'resolutionNote', 'A resolution note');
        },
      },
      Escalated: {
        // Level 1 (HOD) -> level 2 (Dean). Guarded so the level strictly rises,
        // which is what stops the cron job escalating the same ticket forever.
        roles: ['system', 'admin'],
        label: 'Escalate further',
        requires: ['reason', 'escalationLevel'],
        guard: (ctx) => assertEscalation(ctx),
      },
    });
  }
}

/** A resolution has been proposed and is awaiting the complainant's verdict. */
class ResolvedState extends ComplaintState {
  get name() {
    return /** @type {ComplaintStatus} */ ('Resolved');
  }

  /** @returns {Readonly<Partial<Record<ComplaintStatus, TransitionRule>>>} */
  get transitions() {
    return ({
      Closed: {
        roles: ['student', 'admin'],
        label: 'Accept and close',
        guard: requireCreatorOrAdmin,
      },
      Investigating: {
        // The complainant rejects the resolution. Without this edge, "resolved"
        // would be the institution's word against the student's.
        roles: ['student', 'admin'],
        label: 'Reopen — not resolved',
        requires: ['reason'],
        guard: (ctx) => {
          requireCreatorOrAdmin(ctx);
          requireNote(ctx.payload, 'reason', 'A reason for reopening');
        },
      },
    });
  }
}

/** Terminal. Nothing leaves this state. */
class ClosedState extends ComplaintState {
  get name() {
    return /** @type {ComplaintStatus} */ ('Closed');
  }

  get isTerminal() {
    return true;
  }
}

/* -------------------------------------------------------------------------- */
/* Shared guards                                                              */
/* -------------------------------------------------------------------------- */

/**
 * An escalation must name a level that is strictly higher than the one already
 * recorded. This single rule is what makes the hourly sweep idempotent: once a
 * complaint sits at level 2 no further escalation is possible.
 * @param {TransitionContext} ctx
 */
function assertEscalation(ctx) {
  const level = ctx.payload.escalationLevel;
  if (level !== 1 && level !== 2) {
    throw new InvalidTransitionError('Escalation level must be 1 (HOD) or 2 (Dean/Director).', {
      field: 'escalationLevel',
    });
  }
  if (level <= ctx.complaint.escalation_level) {
    throw new InvalidTransitionError(
      `This complaint is already escalated to level ${ctx.complaint.escalation_level}.`,
      { field: 'escalationLevel', current: ctx.complaint.escalation_level },
    );
  }
  requireNote(ctx.payload, 'reason', 'An escalation reason');
}

/**
 * A reassignment that changes neither the owner nor the department is a no-op
 * that would pollute the timeline with a meaningless entry.
 * @param {TransitionContext} ctx
 */
function assertReassignmentChangesSomething(ctx) {
  const { payload, complaint } = ctx;
  if (!payload.assignedTo) {
    throw new InvalidTransitionError('Select the handler who will own this complaint.', {
      field: 'assignedTo',
    });
  }
  const sameOwner = payload.assignedTo === complaint.assigned_to;
  const sameDepartment =
    payload.departmentId === undefined || payload.departmentId === complaint.department_id;
  if (sameOwner && sameDepartment && complaint.status === 'Assigned') {
    throw new InvalidTransitionError('This complaint is already assigned to that handler.', {
      field: 'assignedTo',
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

/** @type {Readonly<Record<ComplaintStatus, ComplaintState>>} */
const STATES = Object.freeze({
  Submitted: new SubmittedState(),
  Assigned: new AssignedState(),
  Investigating: new InvestigatingState(),
  Resolved: new ResolvedState(),
  Closed: new ClosedState(),
  Escalated: new EscalatedState(),
});

/** Every status the system recognises, in lifecycle order. */
export const COMPLAINT_STATUSES = /** @type {ReadonlyArray<ComplaintStatus>} */ ([
  'Submitted',
  'Assigned',
  'Investigating',
  'Escalated',
  'Resolved',
  'Closed',
]);

/** Statuses that still consume SLA budget. */
export const OPEN_STATUSES = /** @type {ReadonlyArray<ComplaintStatus>} */ ([
  'Submitted',
  'Assigned',
  'Investigating',
  'Escalated',
]);

/**
 * @param {string} status
 * @returns {status is ComplaintStatus}
 */
export function isComplaintStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATES, status);
}

/**
 * Resolves the State object for a status.
 * @param {ComplaintStatus | string} status
 * @returns {ComplaintState}
 */
export function getState(status) {
  if (!isComplaintStatus(status)) {
    throw new InvalidTransitionError(`Unknown complaint status "${status}".`);
  }
  return STATES[status];
}

/**
 * The column patch a transition implies. Derived from the *destination* status,
 * so timestamps and denormalised fields can never drift out of step with it.
 *
 * @param {TransitionContext} ctx
 * @param {Date} [now]
 * @returns {Record<string, unknown>}
 */
export function buildPatch(ctx, now = new Date()) {
  const { complaint, payload, to } = ctx;

  /** @type {Record<string, unknown>} */
  const patch = {
    status: to,
    // The SLA clock. Only genuine lifecycle activity moves it, which is why the
    // escalation sweep reads this column rather than `updated_at`.
    last_activity_at: now,
  };

  switch (to) {
    case 'Assigned':
      patch.assigned_to = payload.assignedTo ?? complaint.assigned_to;
      if (payload.departmentId !== undefined) patch.department_id = payload.departmentId;
      // "Time to assignment" measures the FIRST time a human took ownership;
      // a later hand-over must not rewrite that number.
      patch.assigned_at = complaint.assigned_at ?? now;
      break;

    case 'Submitted':
      // Returned to the departmental queue: drop the owner but keep assigned_at,
      // which is a historical fact about this complaint.
      patch.assigned_to = null;
      break;

    case 'Investigating':
      if (complaint.status === 'Resolved') {
        // Reopened. The proposed resolution no longer counts towards SLA
        // compliance, so the resolution timestamp is cleared.
        patch.resolved_at = null;
      }
      break;

    case 'Escalated':
      patch.escalation_level = payload.escalationLevel;
      if (payload.assignedTo !== undefined) patch.assigned_to = payload.assignedTo;
      if (payload.departmentId !== undefined) patch.department_id = payload.departmentId;
      if (payload.assignedTo && !complaint.assigned_at) patch.assigned_at = now;
      break;

    case 'Resolved':
      patch.resolution_note = (payload.resolutionNote ?? '').trim();
      patch.resolved_at = now;
      break;

    case 'Closed':
      patch.closed_at = now;
      if (payload.closureNote) patch.closure_note = payload.closureNote.trim();
      break;

    default:
      break;
  }

  return patch;
}

/**
 * The one entry point the service layer uses: validate, then compute.
 * Throws on any illegal or unauthorised move.
 *
 * @param {TransitionContext} ctx
 * @param {Date} [now]
 * @returns {{ rule: TransitionRule, patch: Record<string, unknown> }}
 */
export function planTransition(ctx, now = new Date()) {
  const rule = getState(ctx.complaint.status).assertCanTransition(ctx);
  return { rule, patch: buildPatch(ctx, now) };
}
