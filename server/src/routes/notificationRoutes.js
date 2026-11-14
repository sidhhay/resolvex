/** /api/notifications */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate, validateIdParam } from '../middleware/validate.js';
import * as notificationController from '../controllers/notificationController.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate(
    {
      limit: { type: 'integer', min: 1, max: 100, default: 30 },
      unreadOnly: { type: 'boolean', default: false },
    },
    'query',
  ),
  asyncHandler(notificationController.list),
);

router.post('/read-all', asyncHandler(notificationController.markAllRead));
router.patch('/:id/read', validateIdParam('id'), asyncHandler(notificationController.markRead));

export default router;
