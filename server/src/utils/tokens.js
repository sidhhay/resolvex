/**
 * JWT signing and verification.
 *
 * Shared by the HTTP auth middleware and the Socket.IO handshake so both
 * accept exactly the same token — a client that can call the API can open a
 * socket, and revoking one revokes the other.
 */
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { UnauthorizedError } from '../domain/errors.js';

/**
 * @typedef {Object} TokenClaims
 * @property {number} sub            User id.
 * @property {'student' | 'handler' | 'admin'} role
 * @property {number | null} departmentId
 * @property {string} email
 * @property {string} name
 */

/**
 * @param {TokenClaims} claims
 * @returns {string}
 */
export function signAccessToken(claims) {
  // No `subject` option here: the payload already carries `sub`, and
  // jsonwebtoken rejects the combination outright.
  return jwt.sign(claims, config.auth.jwtSecret, {
    expiresIn: /** @type {any} */ (config.auth.jwtExpiresIn),
    issuer: 'resolvex',
    audience: 'resolvex-client',
  });
}

/**
 * Verifies a token and returns its claims.
 * @param {string} token
 * @returns {TokenClaims}
 * @throws {UnauthorizedError} on any expired, malformed or forged token.
 */
export function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret, {
      issuer: 'resolvex',
      audience: 'resolvex-client',
    });
    if (typeof decoded === 'string') throw new Error('unexpected token payload');
    return /** @type {TokenClaims} */ ({
      ...decoded,
      sub: Number(decoded.sub),
    });
  } catch (error) {
    // Never leak *why* verification failed — expired, forged and malformed all
    // look identical to a caller probing the endpoint.
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Your session has expired, please sign in again');
    }
    throw new UnauthorizedError('Invalid or expired credentials');
  }
}

/**
 * Pulls a bearer token out of an Authorization header.
 * @param {string | undefined} header
 * @returns {string | null}
 */
export function extractBearerToken(header) {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
