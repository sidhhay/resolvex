/**
 * Role-based access control.
 *
 * Coarse gate only: "may this role reach this endpoint at all". Record-level
 * questions ("is this *your* complaint") belong to the domain layer —
 * `assertCanView` and the State pattern's guards — because they need the record
 * itself to answer.
 */
import { ForbiddenError, UnauthorizedError } from '../domain/errors.js';

/** @typedef {'student' | 'handler' | 'admin'} Role */

/**
 * @param {...Role} roles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `This action requires the ${roles.join(' or ')} role; you are signed in as ${req.user.role}.`,
        ),
      );
    }
    return next();
  };
}

/** Convenience gates for the three surfaces of the app. */
export const requireAdmin = requireRole('admin');
export const requireStaff = requireRole('handler', 'admin');
