/**
 * Typed application errors.
 *
 * Controllers throw these; the central error middleware turns them into a
 * consistent JSON envelope. Anything that is NOT an AppError is treated as an
 * unexpected fault: logged with its stack and reported to the client as a bare
 * 500 so internal details never leak.
 */

export class AppError extends Error {
  /**
   * @param {string} message   Human-readable, safe to show the end user.
   * @param {number} statusCode
   * @param {string} code      Stable machine-readable code for the frontend.
   * @param {unknown} [details] Field-level detail (validation errors, etc.).
   */
  constructor(message, statusCode, code, details) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    /** Marks the error as safe to surface verbatim. */
    this.expected = true;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** 400 — the request itself is malformed or fails validation. */
export class BadRequestError extends AppError {
  /** @param {string} [message] @param {unknown} [details] */
  constructor(message = 'Invalid request', details) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/** 401 — no credentials, or credentials that do not verify. */
export class UnauthorizedError extends AppError {
  /** @param {string} [message] */
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/** 403 — authenticated, but not allowed to do this. */
export class ForbiddenError extends AppError {
  /** @param {string} [message] */
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

/** 404 — the resource does not exist, or the caller may not know that it does. */
export class NotFoundError extends AppError {
  /** @param {string} [resource] */
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/** 409 — the request conflicts with current state (duplicate e-mail, etc.). */
export class ConflictError extends AppError {
  /** @param {string} [message] @param {unknown} [details] */
  constructor(message = 'Conflict with the current state of the resource', details) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * 422 — the request is well-formed but the domain refuses it. This is what an
 * illegal state transition raises (see domain/complaintState.js).
 */
export class InvalidTransitionError extends AppError {
  /** @param {string} message @param {unknown} [details] */
  constructor(message, details) {
    super(message, 422, 'INVALID_STATE_TRANSITION', details);
  }
}

/** 413 — upload exceeded the configured size ceiling. */
export class PayloadTooLargeError extends AppError {
  /** @param {string} [message] */
  constructor(message = 'Uploaded file is too large') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
  }
}

/** 429 — rate limited. */
export class TooManyRequestsError extends AppError {
  /** @param {string} [message] @param {number} [retryAfterSeconds] */
  constructor(message = 'Too many requests, please slow down', retryAfterSeconds) {
    super(message, 429, 'TOO_MANY_REQUESTS', { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 503 — a dependency (SMTP, Cloudinary, the LLM) is unavailable. */
export class ServiceUnavailableError extends AppError {
  /** @param {string} [message] */
  constructor(message = 'A downstream service is temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * @param {unknown} error
 * @returns {error is AppError}
 */
export function isAppError(error) {
  return error instanceof AppError;
}
