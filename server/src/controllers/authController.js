/**
 * Authentication and account management.
 *
 * Public registration creates students only. Handler and administrator accounts
 * are provisioned by an existing administrator — a self-service endpoint that
 * accepted a `role` field would be a privilege-escalation hole.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { ConflictError, UnauthorizedError, BadRequestError, ServiceUnavailableError } from '../domain/errors.js';
import { signAccessToken } from '../utils/tokens.js';
import { requireUser } from '../middleware/auth.js';
import * as userRepo from '../repositories/userRepo.js';
import * as departmentRepo from '../repositories/departmentRepo.js';
import { logger } from '../config/logger.js';
import { sendMail, renderEmail } from '../services/mailer.js';
import * as otpRepo from '../repositories/otpRepo.js';
import * as pendingSignupRepo from '../repositories/pendingSignupRepo.js';

/**
 * A bcrypt hash of a value nobody knows, compared against when an e-mail does
 * not exist. Without it, "unknown e-mail" would return measurably faster than
 * "wrong password" and the endpoint would enumerate accounts.
 */
const DUMMY_HASH = bcrypt.hashSync('resolvex-timing-equaliser', config.auth.bcryptRounds);

/**
 * @param {import('../repositories/userRepo.js').UserRecord} user
 * @returns {{ token: string, user: Record<string, unknown> }}
 */
function authResponse(user) {
  const token = signAccessToken({
    sub: user.id,
    role: user.role,
    departmentId: user.department_id,
    email: user.email,
    name: user.name,
  });
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
      departmentName: user.department_name,
      createdAt: user.created_at,
    },
  };
}

/**
 * POST /api/auth/register — begin student registration; account is not created yet.
 */
export async function register(req, res) {
  const { name, email, password } = /** @type {any} */ (req.validated);
  if (await userRepo.findByEmail(email)) {
    throw new ConflictError('An account with that e-mail address already exists');
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pendingSignupRepo.savePendingSignup({
    name, email, passwordHash, codeHash: sha256(code), expiresAt,
  });

  const sent = await sendMail({
    to: email,
    subject: 'Verify your email — ResolveX signup code',
    text: `Your ResolveX verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
    html: renderEmail({
      heading: `Your verification code: ${code}`,
      body: 'Enter this six-digit code in ResolveX to verify your email and finish creating your account. It expires in 10 minutes.',
      cta: 'Open ResolveX',
    }),
  });
  if (!sent) {
    await pendingSignupRepo.deletePendingSignup(email);
    throw new ServiceUnavailableError('We could not send the verification email. Please try again later.');
  }

  res.status(202).json({ message: 'Verification code sent. Check your email and enter the 6-digit code.' });
}

/**
 * POST /api/auth/register/verify — create a student account only after email ownership is proven.
 */
export async function verifyRegistrationOtp(req, res) {
  const { email, code } = /** @type {any} */ (req.validated);
  const pending = await pendingSignupRepo.findPendingSignup(email);
  if (!pending || new Date(pending.expires_at).getTime() <= Date.now()) {
    if (pending) await pendingSignupRepo.deletePendingSignup(email);
    throw new UnauthorizedError('Verification code expired or signup was not started. Please register again.');
  }
  if (pending.attempts >= 5) {
    await pendingSignupRepo.deletePendingSignup(email);
    throw new UnauthorizedError('Too many incorrect codes. Please start registration again.');
  }
  if (pending.code_hash !== sha256(code)) {
    const attempts = await pendingSignupRepo.incrementAttempts(email);
    if (attempts >= 5) await pendingSignupRepo.deletePendingSignup(email);
    throw new UnauthorizedError('Incorrect verification code. Please check the code and try again.');
  }
  if (await userRepo.findByEmail(email)) {
    await pendingSignupRepo.deletePendingSignup(email);
    throw new ConflictError('An account with that e-mail address already exists');
  }

  const user = await userRepo.create({
    name: pending.name,
    email,
    passwordHash: pending.password_hash,
    role: config.auth.selfServiceRole,
    departmentId: null,
  });
  await pendingSignupRepo.deletePendingSignup(email);
  res.status(201).json(authResponse(user));
}

/**
 * POST /api/auth/login
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function login(req, res) {
  const { email, password } = /** @type {any} */ (req.validated);

  const user = await userRepo.findByEmailWithSecret(email);
  // Always run a comparison so both branches cost the same.
  const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !passwordMatches) {
    throw new UnauthorizedError('E-mail or password is incorrect');
  }
  if (!user.is_active) {
    throw new UnauthorizedError('This account has been deactivated. Contact the administrator.');
  }

  res.json(authResponse(user));
}

/**
 * GET /api/auth/me — rehydrates the session on page load.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function me(req, res) {
  const session = requireUser(req);
  const user = await userRepo.findById(session.id);
  if (!user) throw new UnauthorizedError('Account no longer exists');

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
      departmentName: user.department_name,
      createdAt: user.created_at,
    },
  });
}

/**
 * POST /api/auth/users — administrator provisioning of staff accounts.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createStaffAccount(req, res) {
  const { name, email, password, role, departmentId } = /** @type {any} */ (req.validated);

  if (role === 'handler' && !departmentId) {
    throw new BadRequestError('Handlers must belong to a department', {
      departmentId: 'departmentId is required for the handler role',
    });
  }
  if (departmentId && !(await departmentRepo.findById(departmentId))) {
    throw new BadRequestError('Unknown department', { departmentId: 'no such department' });
  }
  if (await userRepo.findByEmail(email)) {
    throw new ConflictError('An account with that e-mail address already exists');
  }

  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  const user = await userRepo.create({ name, email, passwordHash, role, departmentId });

  res.status(201).json({ user });
}

/** @param {string} raw @returns {string} */
function sha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * POST /api/auth/forgot-password
 * Sends a short-lived email OTP. Response is identical for known/unknown emails.
 */
export async function forgotPassword(req, res) {
  const { email } = /** @type {any} */ (req.validated);
  const user = await userRepo.findByEmail(email);

  if (user && user.is_active) {
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await otpRepo.upsertOtp(user.id, sha256(code), expiresAt);

    const sent = await sendMail({
      to: email,
      subject: 'Your ResolveX password reset code',
      text: `Your ResolveX password reset code is: ${code}\\n\\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
      html: renderEmail({
        heading: `Your password reset code: ${code}`,
        body: 'Enter this six-digit code in ResolveX to reset your password. It expires in 10 minutes. Do not share it with anyone.',
        cta: 'Open ResolveX',
      }),
    });
    if (!sent) {
      await otpRepo.consumeOtp(user.id);
      throw new ServiceUnavailableError('We could not send the reset code. Please try again later.');
    }
  }

  res.json({ message: 'If that address is registered, a password reset code has been sent.' });
}

/**
 * POST /api/auth/forgot-password/verify
 * Verifies the reset OTP and changes the password in one operation.
 */
export async function resetPasswordWithOtp(req, res) {
  const { email, code, password } = /** @type {any} */ (req.validated);
  const user = await userRepo.findByEmail(email);
  if (!user || !user.is_active) {
    throw new UnauthorizedError('The code is incorrect or has expired.');
  }

  const otpRow = await otpRepo.findActiveOtp(user.id);
  if (!otpRow || otpRow.code_hash !== sha256(code)) {
    throw new UnauthorizedError('The code is incorrect or has expired.');
  }

  const newHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  await userRepo.resetPassword(user.id, newHash);
  await otpRepo.consumeOtp(user.id);

  await sendMail({
    to: user.email,
    subject: 'Your ResolveX password was changed',
    text: `Hello ${user.name},\\n\\nYour ResolveX account password was successfully updated. If you did not perform this change, contact an administrator immediately.`,
    html: renderEmail({
      heading: 'Password changed successfully',
      body: `Hello ${user.name}, your account password has been updated. If you did not make this change, contact an administrator immediately.`,
      cta: 'Go to ResolveX',
    }),
  });

  logger.info('Password reset completed with email OTP', { userId: user.id });
  res.json({ message: 'Password updated successfully. Please sign in with your new password.' });
}

/**
 * POST /api/auth/reset-password
 */
export async function resetPassword(req, res) {
  const { token, password } = /** @type {any} */ (req.validated);
  const tokenHash = sha256(token);
  const user = await userRepo.findByResetToken(tokenHash);

  if (!user) throw new BadRequestError('This reset link is invalid or has expired.');

  const newHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  await userRepo.resetPassword(user.id, newHash);

  // Send security confirmation email
  await sendMail({
    to: user.email,
    subject: 'Your ResolveX password was changed',
    text: `Hello ${user.name},\n\nYour ResolveX account password was successfully updated.\n\nIf you did not perform this change, please contact support or an administrator immediately.`,
    html: renderEmail({
      heading: 'Password changed successfully',
      body: `Hello ${user.name}, your account password has been updated. If you made this change, no further action is needed.\n\nIf you did not make this change, please contact an administrator immediately.`,
      cta: 'Go to ResolveX',
      complaintId: undefined,
    }),
  });

  logger.info('Password reset completed', { userId: user.id, email: user.email });
  res.json({ message: 'Password updated successfully. Please sign in with your new password.' });
}

/**
 * POST /api/auth/otp/request
 * Sends a 6-digit OTP to the user's email. Always returns 200.
 */
export async function requestOtp(req, res) {
  const { email } = /** @type {any} */ (req.validated);
  const user = await userRepo.findByEmail(email);
  let devCode = null;

  if (user && user.is_active) {
    const code = String(crypto.randomInt(100000, 999999)); // 6 digits
    const codeHash = sha256(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    devCode = code;

    await otpRepo.upsertOtp(user.id, codeHash, expiresAt);

    await sendMail({
      to: email,
      subject: `${code} — Your ResolveX sign-in code`,
      text: `Your one-time sign-in code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
      html: renderEmail({
        heading: `Your sign-in code: ${code}`,
        body: `Use this code to sign in to ResolveX. It expires in 10 minutes.\n\nDo not share this code with anyone. ResolveX staff will never ask for it.`,
        cta: 'Open ResolveX',
        complaintId: undefined,
      }),
    });

    logger.info('OTP email requested', { email });
  }

  res.json({
    message: 'If that address is registered, a sign-in code has been sent.',
  });
}

/**
 * POST /api/auth/otp/verify
 */
export async function verifyOtp(req, res) {
  const { email, code } = /** @type {any} */ (req.validated);
  const user = await userRepo.findByEmail(email);

  if (!user || !user.is_active) throw new UnauthorizedError('Invalid code or email.');

  const codeHash = sha256(code);
  const otpRow = await otpRepo.findActiveOtp(user.id);

  if (!otpRow || otpRow.code_hash !== codeHash) {
    throw new UnauthorizedError('The code is incorrect or has expired.');
  }

  await otpRepo.consumeOtp(user.id);
  logger.info('OTP login successful', { userId: user.id });

  res.json(authResponse(user));
}
