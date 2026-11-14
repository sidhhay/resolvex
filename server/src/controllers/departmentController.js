/** Department lookup endpoints — used by filters and assignment dropdowns. */
import { requireUser } from '../middleware/auth.js';
import { ForbiddenError } from '../domain/errors.js';
import * as departmentRepo from '../repositories/departmentRepo.js';
import * as userRepo from '../repositories/userRepo.js';

/**
 * GET /api/departments
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
export async function list(_req, res) {
  res.json({ departments: await departmentRepo.list() });
}

/**
 * GET /api/departments/:id/handlers
 *
 * Populates the "assign to" control. A handler may only enumerate their own
 * department's staff; administrators may look anywhere.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handlers(req, res) {
  const user = requireUser(req);
  const { id } = /** @type {any} */ (req.validated);

  if (user.role === 'handler' && user.departmentId !== id) {
    throw new ForbiddenError('You can only view handlers in your own department');
  }

  res.json({ handlers: await userRepo.listHandlers(id) });
}
