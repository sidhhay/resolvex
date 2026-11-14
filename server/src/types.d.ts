/**
 * Ambient type augmentation.
 *
 * `npm run typecheck` runs tsc with `checkJs`, so these declarations give the
 * JSDoc-annotated source real type-checking over Express's request object.
 */
import type { SessionUser } from './services/complaintService.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`; present on every protected route. */
      user?: SessionUser;
      /** Output of the validation middleware — never trust `req.body` directly. */
      validated?: Record<string, any>;
      /** Correlates a request across log lines. */
      requestId?: string;
    }
  }
}

export {};
