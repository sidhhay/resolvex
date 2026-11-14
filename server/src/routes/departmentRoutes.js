/** /api/departments */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requireStaff } from '../middleware/rbac.js';
import { validateIdParam } from '../middleware/validate.js';
import * as departmentController from '../controllers/departmentController.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(departmentController.list));

router.get(
  '/:id/handlers',
  requireStaff,
  validateIdParam('id'),
  asyncHandler(departmentController.handlers),
);

export default router;
