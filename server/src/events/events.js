/**
 * Event catalogue for the Observer pattern.
 *
 * One module owns the event names, the payload shape and the human wording, so
 * a real-time toast, a stored notification row and a transactional e-mail all
 * describe the same thing in the same words.
 */

export const EVENTS = Object.freeze({
  COMPLAINT_CREATED: 'complaint.created',
  COMPLAINT_ASSIGNED: 'complaint.assigned',
  COMPLAINT_STATUS_CHANGED: 'complaint.status_changed',
  COMPLAINT_ESCALATED: 'complaint.escalated',
  COMPLAINT_RESOLVED: 'complaint.resolved',
  COMPLAINT_CLOSED: 'complaint.closed',
  /** Emitted by the persistence observer once a notification row exists. */
  NOTIFICATION_CREATED: 'notification.created',
});

/** @typedef {typeof EVENTS[keyof typeof EVENTS]} EventName */

/**
 * Who should hear about an event. Resolved once by the service layer so that no
 * observer has to run its own queries.
 *
 * @typedef {Object} Audience
 * @property {number[]} userIds  In-app notification + personal socket channel.
 * @property {string[]} emails   Transactional e-mail recipients.
 * @property {string[]} rooms    Socket.IO rooms for broadcast (see realtime/socket.js).
 */

/**
 * @typedef {Object} ComplaintEventPayload
 * @property {import('../repositories/complaintRepo.js').ComplaintRecord} complaint
 * @property {{ id: number | null, name: string, role: string }} actor
 * @property {import('../domain/complaintState.js').ComplaintStatus} [fromStatus]
 * @property {import('../domain/complaintState.js').ComplaintStatus} [toStatus]
 * @property {string} [note]
 * @property {number} [escalationLevel]
 * @property {Audience} audience
 */

/**
 * @typedef {Object} NotificationEventPayload
 * @property {Array<import('../repositories/notificationRepo.js').NotificationRecord>} notifications
 * @property {EventName} sourceEvent
 * @property {number} [complaintId]
 */

/** Human names for the escalation tiers. */
export const ESCALATION_LEVEL_NAMES = Object.freeze({
  1: 'Head of Department',
  2: 'Dean / Director',
});

/**
 * The single canonical sentence for an event. Used verbatim as the notification
 * row's `message`, as the socket toast and as the e-mail's opening line.
 *
 * @param {EventName} event
 * @param {ComplaintEventPayload} payload
 * @returns {string}
 */
export function describeEvent(event, payload) {
  const { complaint, actor, fromStatus, toStatus, escalationLevel } = payload;
  const ref = `#${complaint.id} "${truncate(complaint.title, 60)}"`;

  switch (event) {
    case EVENTS.COMPLAINT_CREATED:
      return `New complaint ${ref} was filed and routed to ${complaint.department_name ?? 'triage'}.`;
    case EVENTS.COMPLAINT_ASSIGNED:
      return `Complaint ${ref} was assigned to ${complaint.assignee_name ?? 'a handler'}.`;
    case EVENTS.COMPLAINT_ESCALATED: {
      const tier = ESCALATION_LEVEL_NAMES[/** @type {1 | 2} */ (escalationLevel ?? 1)] ?? 'a higher authority';
      return `Complaint ${ref} breached its SLA and was escalated to the ${tier}.`;
    }
    case EVENTS.COMPLAINT_RESOLVED:
      return `Complaint ${ref} was marked resolved by ${actor.name}. Please review and confirm.`;
    case EVENTS.COMPLAINT_CLOSED:
      return `Complaint ${ref} has been closed.`;
    case EVENTS.COMPLAINT_STATUS_CHANGED:
    default:
      return `Complaint ${ref} moved from ${fromStatus ?? 'its previous state'} to ${toStatus ?? complaint.status}.`;
  }
}

/**
 * Subject line for the e-mail observer.
 * @param {EventName} event
 * @param {ComplaintEventPayload} payload
 * @returns {string}
 */
export function emailSubject(event, payload) {
  const id = payload.complaint.id;
  switch (event) {
    case EVENTS.COMPLAINT_CREATED:
      return `[ResolveX #${id}] Complaint received`;
    case EVENTS.COMPLAINT_ASSIGNED:
      return `[ResolveX #${id}] Assigned to you`;
    case EVENTS.COMPLAINT_ESCALATED:
      return `[ResolveX #${id}] ESCALATED — SLA breached`;
    case EVENTS.COMPLAINT_RESOLVED:
      return `[ResolveX #${id}] Resolution proposed`;
    case EVENTS.COMPLAINT_CLOSED:
      return `[ResolveX #${id}] Complaint closed`;
    default:
      return `[ResolveX #${id}] Status updated`;
  }
}

/**
 * @param {string} value
 * @param {number} max
 * @returns {string}
 */
function truncate(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
