/**
 * Authentication and account management.
 *
 * Public registration creates students only. Handler and administrator accounts
 * are provisioned by an existing administrator — a self-service endpoint that
 * accepted a `role` field would be a privilege-escalation hole.
 */
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { ConflictError, UnauthorizedError, BadRequestError } from '../domain/errors.js';
import { signAccessToken } from '../utils/tokens.js';
import { requireUser } from '../middleware/auth.js';
import * as userRepo from '../repositories/userRepo.js';
import * as departmentRepo from '../repositories/departmentRepo.js';

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
 * POST /api/auth/register — self-service, students only.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function register(req, res) {
  const { name, email, password } = /** @type {any} */ (req.validated);

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    // The address is already visible to whoever owns it, and a vague error here
    // would send real users in circles. Registration is rate-limited instead.
    throw new ConflictError('An account with that e-mail address already exists');
  }

  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  const user = await userRepo.create({
    name,
    email,
    passwordHash,
    role: config.auth.selfServiceRole,
    departmentId: null,
  });

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
