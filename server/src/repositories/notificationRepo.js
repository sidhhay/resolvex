/** Data access for in-app notifications. */
import { query } from '../config/db.js';

/**
 * @typedef {Object} NotificationRecord
 * @property {number} id
 * @property {number} user_id
 * @property {string} message
 * @property {number | null} complaint_id
 * @property {string | null} event_type
 * @property {boolean} is_read
 * @property {Date} created_at
 */

/**
 * Inserts one row per recipient in a single statement — an escalation can fan
 * out to a dozen people and should not cost a dozen round trips.
 *
 * @param {{ userIds: number[], message: string, complaintId?: number | null, eventType?: string }} input
 * @returns {Promise<NotificationRecord[]>}
 */
export async function createMany(input) {
  const userIds = [...new Set(input.userIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (userIds.length === 0) return [];

  const { rows } = await query(
    `INSERT INTO notifications (user_id, message, complaint_id, event_type)
     SELECT uid, $2, $3, $4 FROM unnest($1::bigint[]) AS uid
     RETURNING id, user_id, message, complaint_id, event_type, is_read, created_at`,
    [userIds, input.message, input.complaintId ?? null, input.eventType ?? null],
  );
  return rows;
}

/**
 * @param {number} userId
 * @param {{ limit?: number, unreadOnly?: boolean }} [options]
 * @returns {Promise<NotificationRecord[]>}
 */
export async function listForUser(userId, options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const { rows } = await query(
    `SELECT id, user_id, message, complaint_id, event_type, is_read, created_at
       FROM notifications
      WHERE user_id = $1
        AND ($2::boolean IS NOT TRUE OR is_read = FALSE)
      ORDER BY created_at DESC
      LIMIT $3`,
    [userId, options.unreadOnly ?? false, limit],
  );
  return rows;
}

/**
 * @param {number} userId
 * @returns {Promise<number>}
 */
export async function unreadCount(userId) {
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );
  return rows[0]?.count ?? 0;
}

/**
 * Scoped by user_id as well as id so one user can never mark another's
 * notification as read.
 *
 * @param {number} userId
 * @param {number} notificationId
 * @returns {Promise<NotificationRecord | null>}
 */
export async function markRead(userId, notificationId) {
  const { rows } = await query(
    `UPDATE notifications SET is_read = TRUE
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, message, complaint_id, event_type, is_read, created_at`,
    [notificationId, userId],
  );
  return rows[0] ?? null;
}

/**
 * @param {number} userId
 * @returns {Promise<number>} how many rows were affected.
 */
export async function markAllRead(userId) {
  const result = await query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );
  return result.rowCount ?? 0;
}
