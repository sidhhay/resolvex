/** /api/auth */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config/env.js';
import * as authController from '../controllers/authController.js';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
// At least one letter and one digit — cheap, and it stops the "password" tier
// of credentials without frustrating users with symbol gymnastics.
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const credentialFields = {
  email: { type: /** @type {const} */ ('string'), required: true, max: 254, lowercase: true, pattern: EMAIL_PATTERN, message: 'Enter a valid e-mail address' },
  password: {
    type: /** @type {const} */ ('string'),
    required: true,
    min: 8,
    max: 128,
    trim: false,
    pattern: PASSWORD_PATTERN,
    message: 'Password must be at least 8 characters and contain a letter and a number',
  },
};

const router = Router();

// Credential endpoints are the ones worth brute-forcing, so they get their own,
// much tighter budget than the rest of the API.
const authLimiter = rateLimit({
  keyPrefix: 'auth',
  max: config.rateLimit.authMaxAttempts,
  message: 'Too many attempts. Wait a few minutes before trying again.',
});

router.post(
  '/register',
  authLimiter,
  validate({
    name: { type: 'string', required: true, min: 2, max: 120 },
    ...credentialFields,
  }),
  asyncHandler(authController.register),
);

router.post('/login', authLimiter, validate(credentialFields), asyncHandler(authController.login));

router.get('/me', authenticate, asyncHandler(authController.me));

// Staff provisioning — administrators only.
router.post(
  '/users',
  authenticate,
  requireAdmin,
  validate({
    name: { type: 'string', required: true, min: 2, max: 120 },
    ...credentialFields,
    role: { type: 'enum', required: true, values: ['student', 'handler', 'admin'] },
    departmentId: { type: 'integer', min: 1 },
  }),
  asyncHandler(authController.createStaffAccount),
);

export default router;
