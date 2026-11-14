/**
 * OBSERVER — durable in-app notifications.
 *
 * Blocking: the HTTP response that follows a transition must not overtake the
 * rows it announced, otherwise a client that immediately refetches its bell
 * menu sees stale data.
 *
 * After writing, it republishes NOTIFICATION_CREATED so the socket observer can
 * push the persisted rows (with real ids, so "mark as read" works on a toast)
 * without this module knowing that sockets exist.
 */
import { EVENTS, describeEvent } from '../events.js';
import { eventBus } from '../eventBus.js';
import * as notificationRepo from '../../repositories/notificationRepo.js';

/** Events that deserve a durable notification row. */
const NOTIFIABLE = [
  EVENTS.COMPLAINT_CREATED,
  EVENTS.COMPLAINT_ASSIGNED,
  EVENTS.COMPLAINT_STATUS_CHANGED,
  EVENTS.COMPLAINT_ESCALATED,
  EVENTS.COMPLAINT_RESOLVED,
  EVENTS.COMPLAINT_CLOSED,
];

/** @type {import('../eventBus.js').Observer} */
export const notificationObserver = {
  name: 'notification-persistence',
  blocking: true,

  /**
   * @param {import('../events.js').ComplaintEventPayload} payload
   * @param {string} event
   */
  async handle(payload, event) {
    const recipients = payload.audience?.userIds ?? [];
    // Never notify people about their own action — a handler does not need a
    // bell badge telling them they just clicked "resolve".
    const targets = recipients.filter((id) => id !== payload.actor?.id);
    if (targets.length === 0) return;

    const notifications = await notificationRepo.createMany({
      userIds: targets,
      message: describeEvent(/** @type {any} */ (event), payload),
      complaintId: payload.complaint?.id ?? null,
      eventType: event,
    });

    if (notifications.length > 0) {
      await eventBus.publish(EVENTS.NOTIFICATION_CREATED, {
        notifications,
        sourceEvent: event,
        complaintId: payload.complaint?.id,
      });
    }
  },
};

export const NOTIFIABLE_EVENTS = NOTIFIABLE;
