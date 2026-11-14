/**
 * Notification endpoints.
 *
 * Every query and update is scoped by the caller's own id, so one user can
 * never read or acknowledge another's notifications.
 */
import { NotFoundError } from '../domain/errors.js';
import { requireUser } from '../middleware/auth.js';
import * as notificationRepo from '../repositories/notificationRepo.js';

/**
 * GET /api/notifications
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function list(req, res) {
  const user = requireUser(req);
  const { limit, unreadOnly } = /** @type {any} */ (req.validated ?? {});

  const [notifications, unread] = await Promise.all([
    notificationRepo.listForUser(user.id, { limit, unreadOnly }),
    notificationRepo.unreadCount(user.id),
  ]);

  res.json({ notifications, unreadCount: unread });
}

/**
 * PATCH /api/notifications/:id/read
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function markRead(req, res) {
  const user = requireUser(req);
  const { id } = /** @type {any} */ (req.validated);

  const notification = await notificationRepo.markRead(user.id, id);
  if (!notification) throw new NotFoundError('Notification');

  res.json({ notification, unreadCount: await notificationRepo.unreadCount(user.id) });
}

/**
 * POST /api/notifications/read-all
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function markAllRead(req, res) {
  const user = requireUser(req);
  res.json({ updated: await notificationRepo.markAllRead(user.id) });
}
