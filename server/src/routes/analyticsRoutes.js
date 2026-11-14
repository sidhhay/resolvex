/** /api/analytics — administrator only. */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as analyticsController from '../controllers/analyticsController.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get(
  '/overview',
  validate(
    {
      departmentId: { type: 'integer', min: 1 },
      from: { type: 'date' },
      to: { type: 'date' },
      days: { type: 'integer', min: 1, max: 365, default: 30 },
    },
    'query',
  ),
  asyncHandler(analyticsController.overview),
);

router.get(
  '/escalations',
  validate(
    {
      level: { type: 'integer', min: 1, max: 2 },
      departmentId: { type: 'integer', min: 1 },
      page: { type: 'integer', min: 1, default: 1 },
      pageSize: { type: 'integer', min: 1, max: 100, default: 25 },
    },
    'query',
  ),
  asyncHandler(analyticsController.escalations),
);

// A manual sweep writes to every overdue complaint, so it is limited harder
// than a read endpoint.
router.post(
  '/escalations/run',
  rateLimit({ keyPrefix: 'sweep', max: 6, message: 'The sweep can be triggered a few times per window.' }),
  asyncHandler(analyticsController.runSweep),
);

export default router;
