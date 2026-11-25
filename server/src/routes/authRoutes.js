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

const signupLimiter = rateLimit({
  keyPrefix: 'signup',
  max: 5,
  message: 'Too many signup code requests. Wait 15 minutes before trying again.',
});

const signupVerifyLimiter = rateLimit({
  keyPrefix: 'signup-verify',
  max: 10,
  message: 'Too many verification attempts. Wait 15 minutes before trying again.',
});

router.post(
  '/register',
  signupLimiter,
  validate({
    name: { type: 'string', required: true, min: 2, max: 120 },
    ...credentialFields,
  }),
  asyncHandler(authController.register),
);

router.post(
  '/register/verify',
  signupVerifyLimiter,
  validate({
    email: credentialFields.email,
    code: { type: 'string', required: true, min: 6, max: 6, pattern: /^\d{6}$/, message: 'Enter the 6-digit code from your email' },
  }),
  asyncHandler(authController.verifyRegistrationOtp),
);

router.post('/login', authLimiter, validate(credentialFields), asyncHandler(authController.login));

router.get('/me', authenticate, asyncHandler(authController.me));

const passwordResetLimiter = rateLimit({
  keyPrefix: 'pwd-reset',
  max: 5,
  message: 'Too many password reset requests. Wait 15 minutes before trying again.',
});

const otpLimiter = rateLimit({
  keyPrefix: 'otp',
  max: 5,
  message: 'Too many OTP requests. Wait 15 minutes before trying again.',
});

// Forgot / Reset password
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate({ email: credentialFields.email }),
  asyncHandler(authController.forgotPassword),
);

router.post(
  '/forgot-password/verify',
  rateLimit({
    keyPrefix: 'pwd-reset-verify',
    max: 10,
    message: 'Too many verification attempts. Wait 15 minutes before trying again.',
  }),
  validate({
    email: credentialFields.email,
    code: { type: 'string', required: true, min: 6, max: 6, pattern: /^\d{6}$/, message: 'Enter the 6-digit code from your email' },
    password: credentialFields.password,
  }),
  asyncHandler(authController.resetPasswordWithOtp),
);

router.post(
  '/reset-password',
  validate({
    token: { type: 'string', required: true, min: 64, max: 64 },
    password: credentialFields.password,
  }),
  asyncHandler(authController.resetPassword),
);

// Email OTP login
router.post(
  '/otp/request',
  otpLimiter,
  validate({ email: credentialFields.email }),
  asyncHandler(authController.requestOtp),
);

router.post(
  '/otp/verify',
  otpLimiter,
  validate({
    email: credentialFields.email,
    code: { type: 'string', required: true, min: 6, max: 6, pattern: /^\d{6}$/, message: 'Enter the 6-digit code from your email' },
  }),
  asyncHandler(authController.verifyOtp),
);

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
