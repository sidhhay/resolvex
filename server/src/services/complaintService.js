/**
 * Complaint domain service.
 *
 * Where the patterns meet:
 *   • STRATEGY  — `createComplaint` calls `classifyTicket` to route the ticket.
 *   • STATE     — `transitionComplaint` asks the state machine what is legal
 *                 and what to persist; it contains no status branching itself.
 *   • OBSERVER  — every successful change publishes an event *after commit*, so
 *                 observers can only ever read data that actually landed.
 *
 * All writes run inside a transaction with the complaint row locked, which is
 * what makes concurrent handler actions safe.
 */
import { withTransaction } from '../config/db.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { ForbiddenError, NotFoundError } from '../domain/errors.js';
import { planTransition, getState } from '../domain/complaintState.js';
import { classifyTicket } from './ai/index.js';
import { FALLBACK_CATEGORY, findCategoryByLabel } from './ai/taxonomy.js';
import { EVENTS } from '../events/events.js';
import { eventBus } from '../events/eventBus.js';
import * as complaintRepo from '../repositories/complaintRepo.js';
import * as departmentRepo from '../repositories/departmentRepo.js';
import * as escalationRepo from '../repositories/escalationRepo.js';
import * as userRepo from '../repositories/userRepo.js';
import { userRoom, departmentRoom, roleRoom, complaintRoom } from '../realtime/socket.js';

/** @typedef {import('../repositories/complaintRepo.js').ComplaintRecord} ComplaintRecord */
/** @typedef {import('../domain/complaintState.js').ComplaintStatus} ComplaintStatus */
/** @typedef {import('../domain/complaintState.js').Actor} Actor */

/**
 * The authenticated caller, as the middleware assembles it.
 * @typedef {Object} SessionUser
 * @property {number} id
 * @property {string} name
 * @property {'student' | 'handler' | 'admin'} role
 * @property {number | null} departmentId
 * @property {string} [email]
 */

/** A stand-in caller for the escalation cron job. */
export const SYSTEM_ACTOR = Object.freeze({
  id: /** @type {number | null} */ (null),
  name: 'ResolveX SLA monitor',
  role: /** @type {'system'} */ ('system'),
});

/**
 * Enriches a caller with their relationship to one complaint, so the state
 * machine can answer authorisation questions without touching the database.
 *
 * @param {SessionUser | typeof SYSTEM_ACTOR} user
 * @param {ComplaintRecord} complaint
 * @returns {Actor}
 */
export function toActor(user, complaint) {
  if (user.role === 'system') {
    return { id: null, role: 'system' };
  }
  const session = /** @type {SessionUser} */ (user);
  return {
    id: session.id,
    role: session.role,
    isCreator: complaint.created_by === session.id,
    isAssignee: complaint.assigned_to === session.id,
    isDepartmentMember:
      session.departmentId != null && complaint.department_id === session.departmentId,
  };
}

/**
 * Read authorisation. Students see only what they filed; handlers see their
 * department's work and anything assigned to them; admins see everything.
 *
 * @param {ComplaintRecord} complaint
 * @param {SessionUser} user
 * @throws {ForbiddenError}
 */
export function assertCanView(complaint, user) {
  if (user.role === 'admin') return;
  if (complaint.created_by === user.id) return;
  if (user.role === 'handler') {
    if (complaint.assigned_to === user.id) return;
    if (user.departmentId != null && complaint.department_id === user.departmentId) return;
  }
  // 403 rather than 404: the caller supplied a valid id, and pretending the
  // record is missing would be misleading in an accountability system.
  throw new ForbiddenError('You do not have access to this complaint.');
}

/**
 * Everyone who should hear about a change, resolved once so no observer runs
 * its own queries.
 *
 * @param {string} event
 * @param {ComplaintRecord} complaint
 * @param {{ escalatedTo?: import('../repositories/userRepo.js').UserRecord | null }} [extra]
 * @returns {Promise<import('../events/events.js').Audience>}
 */
export async function buildAudience(event, complaint, extra = {}) {
  /** @type {Set<number>} */
  const userIds = new Set();
  /** @type {Set<string>} */
  const emails = new Set();
  /** @type {Set<string>} */
  const rooms = new Set([complaintRoom(complaint.id)]);

  // The complainant is always in the loop — that is the point of the system.
  userIds.add(complaint.created_by);
  rooms.add(userRoom(complaint.created_by));

  if (complaint.assigned_to) {
    userIds.add(complaint.assigned_to);
    rooms.add(userRoom(complaint.assigned_to));
  }
  if (complaint.department_id) {
    rooms.add(departmentRoom(complaint.department_id));
    if (complaint.department_hod_id) userIds.add(complaint.department_hod_id);
  }
  if (extra.escalatedTo) {
    userIds.add(extra.escalatedTo.id);
    rooms.add(userRoom(extra.escalatedTo.id));
  }

  // Escalations are an institutional-accountability signal, so administrators
  // see them live even when they are not on the ticket.
  if (event === EVENTS.COMPLAINT_ESCALATED) {
    rooms.add(roleRoom('admin'));
  }

  // ---- e-mail recipients (a deliberately narrower set than the in-app one) --
  switch (event) {
    case EVENTS.COMPLAINT_CREATED:
      if (complaint.creator_email) emails.add(complaint.creator_email);
      break;
    case EVENTS.COMPLAINT_ASSIGNED:
      if (complaint.assignee_email) emails.add(complaint.assignee_email);
      break;
    case EVENTS.COMPLAINT_ESCALATED: {
      if (extra.escalatedTo?.email) emails.add(extra.escalatedTo.email);
      if (complaint.creator_email) emails.add(complaint.creator_email);
      const department = complaint.department_id
        ? await departmentRepo.findById(complaint.department_id)
        : null;
      if (department?.email) emails.add(department.email);
      break;
    }
    case EVENTS.COMPLAINT_RESOLVED:
    case EVENTS.COMPLAINT_CLOSED:
      if (complaint.creator_email) emails.add(complaint.creator_email);
      if (complaint.assignee_email) emails.add(complaint.assignee_email);
      break;
    default:
      break;
  }

  return { userIds: [...userIds], emails: [...emails], rooms: [...rooms] };
}

/**
 * Picks the most specific event name for a transition, so observers can treat
 * "resolved" differently from a generic status tick.
 *
 * @param {ComplaintStatus} to
 * @param {ComplaintStatus} from
 * @returns {string}
 */
function eventForTransition(to, from) {
  if (to === 'Escalated') return EVENTS.COMPLAINT_ESCALATED;
  if (to === 'Resolved') return EVENTS.COMPLAINT_RESOLVED;
  if (to === 'Closed') return EVENTS.COMPLAINT_CLOSED;
  if (to === 'Assigned' && from !== 'Assigned') return EVENTS.COMPLAINT_ASSIGNED;
  if (to === 'Assigned') return EVENTS.COMPLAINT_ASSIGNED;
  return EVENTS.COMPLAINT_STATUS_CHANGED;
}

/**
 * Files a new complaint: classify (Strategy), route to a department, persist,
 * seed the audit trail, announce (Observer).
 *
 * @param {{ title: string, description: string, attachmentUrl?: string | null,
 *           categoryOverride?: string | null }} input
 * @param {SessionUser} user
 * @returns {Promise<{ complaint: ComplaintRecord, classification: import('./ai/index.js').ClassificationResult }>}
 */
export async function createComplaint(input, user) {
  const rawClassification = await classifyTicket({
    title: input.title,
    description: input.description,
  });

  // Never trust a free-form or stale routing slug. Resolve the category through
  // the canonical taxonomy, then use its department slug.
  const category =
    findCategoryByLabel(rawClassification.category) ?? FALLBACK_CATEGORY;
  let classification = {
    ...rawClassification,
    category: category.label,
    departmentSlug: category.departmentSlug,
  };

  let department = await departmentRepo.findBySlug(category.departmentSlug);

  // A missing mapped department degrades to the guaranteed manual-triage queue.
  if (!department && category.departmentSlug !== FALLBACK_CATEGORY.departmentSlug) {
    logger.warn('Classified department is missing; routing complaint to General Administration', {
      category: category.label,
      slug: category.departmentSlug,
    });
    department = await departmentRepo.findBySlug(FALLBACK_CATEGORY.departmentSlug);
    classification = {
      ...classification,
      category: FALLBACK_CATEGORY.label,
      departmentSlug: FALLBACK_CATEGORY.departmentSlug,
      confidence: Math.min(classification.confidence, 0.2),
      degraded: true,
      reasoning: 'The predicted department is not configured; routed to General Administration for manual triage.',
    };
  }

  // Fail closed before inserting anything. A complaint must never be persisted
  // without a real department row; the database constraint is the final guard.
  if (!department?.id) {
    logger.error('Complaint creation blocked: no configured department or General Administration fallback', {
      requestedSlug: category.departmentSlug,
    });
    throw new Error('Complaint routing is unavailable. Please try again later.');
  }

  const complaint = await withTransaction(async (client) => {
    const created = await complaintRepo.createWithClient(client, {
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.categoryOverride?.trim() || classification.category,
      departmentId: department.id,
      createdBy: user.id,
      priority: classification.priority,
      attachmentUrl: input.attachmentUrl ?? null,
      aiConfidence: classification.confidence,
      aiStrategy: classification.strategy,
    });

    await complaintRepo.insertStatusHistory(client, {
      complaintId: created.id,
      fromStatus: null,
      toStatus: 'Submitted',
      actorId: user.id,
      note: `Classified as ${created.category} by the ${classification.strategy} engine (confidence ${classification.confidence}).`,
    });
    return created;
  });

  // Persistence has committed at this point. Notification preparation must
  // never make the caller believe creation failed (or trigger attachment cleanup)
  // after a complaint row already references the uploaded evidence.
  try {
    const audience = await buildAudience(EVENTS.COMPLAINT_CREATED, complaint);
    await eventBus.publish(EVENTS.COMPLAINT_CREATED, {
      complaint,
      actor: { id: user.id, name: user.name, role: user.role },
      toStatus: 'Submitted',
      audience,
    });
  } catch (error) {
    logger.error('Complaint created, but its notification could not be prepared', {
      complaintId: complaint.id,
      error,
    });
  }

  return { complaint, classification };
}

/**
 * Moves a complaint to a new status.
 *
 * The state machine decides whether the move is legal and what to write; this
 * function owns the transaction, the audit trail and the announcement.
 *
 * @param {Object} params
 * @param {number} params.complaintId
 * @param {ComplaintStatus} params.to
 * @param {import('../domain/complaintState.js').TransitionPayload} [params.payload]
 * @param {SessionUser | typeof SYSTEM_ACTOR} params.user
 * @param {{ level: 1 | 2, reason: string, escalatedTo: number | null }} [params.escalation]
 *        Written inside the same transaction, so a complaint can never show as
 *        Escalated without a matching escalation record.
 * @returns {Promise<{ complaint: ComplaintRecord, fromStatus: ComplaintStatus, event: string }>}
 */
export async function transitionComplaint(params) {
  const { complaintId, to, payload = {}, user, escalation } = params;

  const outcome = await withTransaction(async (client) => {
    // Lock first: two handlers acting simultaneously are serialised here, and
    // the loser re-reads the committed status and is rejected by the guard.
    const current = await complaintRepo.findByIdForUpdate(client, complaintId);
    if (!current) throw new NotFoundError('Complaint');

    if (user.role !== 'system') assertCanView(current, /** @type {SessionUser} */ (user));

    const actor = toActor(user, current);
    const { patch } = planTransition({ complaint: current, actor, to, payload });

    // Never trust the client-side assignment dropdown as an authorization check.
    // The selected account must be active and eligible for the complaint's
    // effective department (including when an administrator moves departments).
    if (patch.assigned_to !== undefined && patch.assigned_to !== null && patch.assigned_to !== current.assigned_to) {
      const departmentId = Number(patch.department_id ?? current.department_id);
      if (!Number.isSafeInteger(departmentId) || departmentId <= 0) {
        throw new ForbiddenError('A valid department is required before assigning this complaint.');
      }
      const assigneeId = Number(patch.assigned_to);
      if (!Number.isSafeInteger(assigneeId) || assigneeId <= 0) {
        throw new ForbiddenError('Select a valid handler for this complaint.');
      }
      const assignee = await userRepo.findAssignableHandler(assigneeId, departmentId, client);
      if (!assignee) {
        throw new ForbiddenError('The selected account is inactive or is not an eligible handler for this department.');
      }
    }

    const updated = await complaintRepo.applyPatch(client, complaintId, patch);

    await complaintRepo.insertStatusHistory(client, {
      complaintId,
      fromStatus: current.status,
      toStatus: to,
      actorId: actor.id,
      note: noteForTransition(payload, to),
    });

    if (escalation) {
      // UNIQUE (complaint_id, level) makes this the idempotency point of the
      // whole SLA sweep: a duplicate run raises 23505 and rolls the whole
      // transaction back, leaving the complaint exactly as it was.
      await escalationRepo.createWithClient(client, {
        complaintId,
        level: escalation.level,
        reason: escalation.reason,
        escalatedTo: escalation.escalatedTo,
      });
    }

    return { complaint: updated, fromStatus: current.status };
  });

  // ---- after commit: announce -----------------------------------------------
  const event = eventForTransition(to, outcome.fromStatus);
  const escalatedTo = escalation?.escalatedTo
    ? await userRepo.findById(escalation.escalatedTo)
    : null;
  const audience = await buildAudience(event, outcome.complaint, { escalatedTo });

  await eventBus.publish(event, {
    complaint: outcome.complaint,
    actor: { id: user.id ?? null, name: user.name, role: user.role },
    fromStatus: outcome.fromStatus,
    toStatus: to,
    note: noteForTransition(payload, to),
    escalationLevel: escalation?.level,
    audience,
  });

  return { ...outcome, event };
}

/**
 * @param {import('../domain/complaintState.js').TransitionPayload} payload
 * @param {ComplaintStatus} to
 * @returns {string | null}
 */
function noteForTransition(payload, to) {
  if (to === 'Resolved') return payload.resolutionNote?.trim() ?? null;
  if (to === 'Closed') return payload.closureNote?.trim() ?? null;
  return payload.reason?.trim() ?? null;
}

/**
 * Full detail view: the complaint, its timeline, its escalations and the moves
 * this particular caller may make next (which drives the action buttons).
 *
 * @param {number} complaintId
 * @param {SessionUser} user
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getComplaintDetail(complaintId, user) {
  const complaint = await complaintRepo.findById(complaintId);
  if (!complaint) throw new NotFoundError('Complaint');
  assertCanView(complaint, user);

  const [timeline, escalations] = await Promise.all([
    complaintRepo.getStatusHistory(complaintId),
    escalationRepo.listForComplaint(complaintId),
  ]);

  const state = getState(complaint.status);
  const actor = toActor(user, complaint);

  return {
    complaint,
    timeline,
    escalations,
    availableTransitions: state.availableTransitions(complaint, actor),
    isTerminal: state.isTerminal,
    sla: describeSla(complaint),
  };
}

/**
 * SLA position for one complaint, used by the citizen timeline and the handler
 * queue to show how close a ticket is to escalating.
 *
 * @param {ComplaintRecord} complaint
 * @returns {{ idleDays: number, nextLevel: 1 | 2 | null, daysUntilEscalation: number | null, breached: boolean }}
 */
export function describeSla(complaint) {
  const closed = complaint.status === 'Resolved' || complaint.status === 'Closed';
  const idleMs = Date.now() - new Date(complaint.last_activity_at).getTime();
  const idleDays = Number((idleMs / 86_400_000).toFixed(2));

  if (closed || complaint.escalation_level >= 2) {
    return { idleDays, nextLevel: null, daysUntilEscalation: null, breached: complaint.escalation_level > 0 };
  }

  const nextLevel = /** @type {1 | 2} */ (complaint.escalation_level === 0 ? 1 : 2);
  const threshold = nextLevel === 1 ? config.sla.level1Days : config.sla.level2Days;
  return {
    idleDays,
    nextLevel,
    daysUntilEscalation: Number(Math.max(0, threshold - idleDays).toFixed(2)),
    breached: idleDays >= threshold,
  };
}
