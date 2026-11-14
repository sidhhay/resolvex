/**
 * OBSERVER — real-time delivery over Socket.IO.
 *
 * Non-blocking: a slow or absent websocket layer must never delay an API
 * response. If Socket.IO is not initialised (unit tests, the cron process),
 * `emitToRooms` is a no-op and this observer costs nothing.
 *
 * Two channels:
 *   complaint:update   → broadcast to the rooms that care about the ticket
 *   notification:new   → the personal bell channel, one event per stored row
 */
import { EVENTS } from '../events.js';
import { emitToRooms, userRoom, complaintRoom } from '../../realtime/socket.js';

/** @type {import('../eventBus.js').Observer} */
export const socketObserver = {
  name: 'socket-broadcast',
  blocking: false,

  /**
   * @param {any} payload
   * @param {string} event
   */
  async handle(payload, event) {
    if (event === EVENTS.NOTIFICATION_CREATED) {
      const { notifications } = /** @type {import('../events.js').NotificationEventPayload} */ (payload);
      for (const notification of notifications) {
        emitToRooms([userRoom(notification.user_id)], 'notification:new', notification);
      }
      return;
    }

    const complaintPayload = /** @type {import('../events.js').ComplaintEventPayload} */ (payload);
    const rooms = new Set(complaintPayload.audience?.rooms ?? []);
    if (complaintPayload.complaint?.id) rooms.add(complaintRoom(complaintPayload.complaint.id));

    emitToRooms([...rooms], 'complaint:update', {
      event,
      complaint: complaintPayload.complaint,
      fromStatus: complaintPayload.fromStatus ?? null,
      toStatus: complaintPayload.toStatus ?? complaintPayload.complaint?.status ?? null,
      escalationLevel: complaintPayload.escalationLevel ?? null,
      actor: complaintPayload.actor
        ? { id: complaintPayload.actor.id, name: complaintPayload.actor.name, role: complaintPayload.actor.role }
        : null,
      at: new Date().toISOString(),
    });
  },
};
