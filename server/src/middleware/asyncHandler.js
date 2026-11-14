/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware.
 *
 * Express 5 already forwards rejections, but wrapping keeps the intent explicit
 * at every call site and makes the handlers portable if the app is ever mounted
 * under Express 4.
 */

/**
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} handler
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
