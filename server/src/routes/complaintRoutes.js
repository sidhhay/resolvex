/** /api/complaints */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validate, validateIdParam } from '../middleware/validate.js';
import { uploadAttachment } from '../middleware/upload.js';
import { config } from '../config/env.js';
import { COMPLAINT_STATUSES } from '../domain/complaintState.js';
import * as complaintController from '../controllers/complaintController.js';

const router = Router();

router.use(authenticate);

const writeLimiter = rateLimit({
  keyPrefix: 'complaint-write',
  max: config.rateLimit.writeMaxRequests,
});

/** Static route first — otherwise `/meta` would match `/:id`. */
router.get('/meta', asyncHandler(complaintController.meta));

router.get(
  '/',
  validate(
    {
      status: { type: 'array', values: COMPLAINT_STATUSES, max: 6 },
      category: { type: 'string', max: 120 },
      priority: { type: 'enum', values: ['low', 'medium', 'high', 'urgent'] },
      search: { type: 'string', max: 200 },
      departmentId: { type: 'integer', min: 1 },
      assignedTo: { type: 'integer', min: 1 },
      createdBy: { type: 'integer', min: 1 },
      mine: { type: 'boolean' },
      openOnly: { type: 'boolean' },
      unassignedOnly: { type: 'boolean' },
      escalatedOnly: { type: 'boolean' },
      from: { type: 'date' },
      to: { type: 'date' },
      page: { type: 'integer', min: 1, default: 1 },
      pageSize: { type: 'integer', min: 1, max: 100, default: 20 },
      sort: {
        type: 'enum',
        values: ['created_at', 'updated_at', 'last_activity_at', 'priority', 'status'],
        default: 'created_at',
      },
      order: { type: 'enum', values: ['asc', 'desc'], default: 'desc' },
    },
    'query',
  ),
  asyncHandler(complaintController.list),
);

router.post(
  '/',
  writeLimiter,
  // Multer runs first: the text fields live in the multipart body and do not
  // exist until it has parsed the request.
  uploadAttachment,
  validate({
    title: { type: 'string', required: true, min: 5, max: 200 },
    description: { type: 'string', required: true, min: 20, max: 5000 },
  }),
  asyncHandler(complaintController.create),
);

router.get('/:id', validateIdParam('id'), asyncHandler(complaintController.detail));

router.get('/:id/timeline', validateIdParam('id'), asyncHandler(complaintController.timeline));

/**
 * The one lifecycle write endpoint. Assign, investigate, resolve, reopen, close
 * and reassign are all a transition; the State pattern decides which are legal
 * for this complaint and this caller.
 */
router.post(
  '/:id/transitions',
  writeLimiter,
  validateIdParam('id'),
  validate({
    to: { type: 'enum', required: true, values: COMPLAINT_STATUSES },
    assignedTo: { type: 'integer', min: 1 },
    departmentId: { type: 'integer', min: 1 },
    resolutionNote: { type: 'string', max: 2000 },
    closureNote: { type: 'string', max: 2000 },
    reason: { type: 'string', max: 2000 },
  }),
  asyncHandler(complaintController.transition),
);

export default router;
