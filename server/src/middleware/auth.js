/**
 * JWT authentication.
 *
 * Verifies the bearer token and rehydrates the caller from the database on
 * every request. Reading the row rather than trusting the token's claims means
 * a deactivated account, a role change or a department move takes effect
 * immediately instead of when the token happens to expire.
 */
import { UnauthorizedError } from '../domain/errors.js';
import { extractBearerToken, verifyAccessToken } from '../utils/tokens.js';
import * as userRepo from '../repositories/userRepo.js';
import { asyncHandler } from './asyncHandler.js';

/** @type {import('express').RequestHandler} */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) throw new UnauthorizedError('Authentication required');

  const claims = verifyAccessToken(token);
  const user = await userRepo.findById(claims.sub);

  if (!user) throw new UnauthorizedError('Account no longer exists');
  if (!user.is_active) throw new UnauthorizedError('This account has been deactivated');

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.department_id,
  };
  next();
});

/**
 * Narrowing helper: throws rather than returning a possibly-undefined user, so
 * controllers can use `req.user` without a null check on every line.
 * @param {import('express').Request} req
 * @returns {import('../services/complaintService.js').SessionUser}
 */
export function requireUser(req) {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  return req.user;
}
