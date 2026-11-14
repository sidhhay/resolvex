/**
 * Centralised error handling.
 *
 * Expected errors (AppError subclasses) are returned verbatim, because their
 * messages were written for the end user. Everything else is logged with its
 * stack and reduced to a bare 500 — an unexpected error's message may contain a
 * connection string, a query or a file path.
 */
import multer from 'multer';
import { AppError, PayloadTooLargeError, BadRequestError } from '../domain/errors.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

/**
 * 404 for anything that fell through the router.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route matches ${req.method} ${req.path}` },
  });
}

/**
 * @param {unknown} error
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(error, req, res, _next) {
  let appError = error;

  // Multer reports upload problems through its own error class.
  if (error instanceof multer.MulterError) {
    appError =
      error.code === 'LIMIT_FILE_SIZE'
        ? new PayloadTooLargeError(
            `File exceeds the ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB limit`,
          )
        : new BadRequestError(`Upload rejected: ${error.message}`, { field: error.field });
  }

  // Malformed JSON from express.json() arrives as a SyntaxError with `body`.
  if (error instanceof SyntaxError && 'body' in error) {
    appError = new BadRequestError('Request body is not valid JSON');
  }

  if (appError instanceof AppError) {
    if (appError.statusCode >= 500) {
      logger.error('Request failed', { path: req.path, method: req.method, error: appError });
    } else {
      logger.debug('Request rejected', {
        path: req.path,
        method: req.method,
        code: appError.code,
        message: appError.message,
      });
    }
    if (appError.statusCode === 429 && 'retryAfterSeconds' in appError) {
      const retry = /** @type {{ retryAfterSeconds?: number }} */ (appError).retryAfterSeconds;
      if (retry) res.setHeader('Retry-After', String(retry));
    }
    res.status(appError.statusCode).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
    });
    return;
  }

  logger.error('Unhandled error', {
    path: req.path,
    method: req.method,
    error,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. The incident has been logged.',
      // The stack is a development affordance only.
      ...(config.isProduction ? {} : { debug: error instanceof Error ? error.message : String(error) }),
    },
  });
}
