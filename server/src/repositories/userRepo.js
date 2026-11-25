/**
 * Data access for users.
 *
 * `password_hash` is never included in the default projection — it is fetched
 * only by `findByEmailWithSecret`, which exists solely for the login flow.
 */
import { query } from '../config/db.js';

/**
 * @typedef {Object} UserRecord
 * @property {number} id
 * @property {string} name
 * @property {string} email
 * @property {'student' | 'handler' | 'admin'} role
 * @property {number | null} department_id
 * @property {string | null} department_name
 * @property {boolean} is_active
 * @property {Date} created_at
 */

const PUBLIC_COLUMNS = `
  u.id, u.name, u.email, u.role, u.department_id, u.is_active, u.created_at,
  d.name AS department_name
`;

const FROM_USERS = `FROM users u LEFT JOIN departments d ON d.id = u.department_id`;

/**
 * @param {number} id
 * @returns {Promise<UserRecord | null>}
 */
export async function findById(id) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS} WHERE u.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * @param {number[]} ids
 * @returns {Promise<UserRecord[]>}
 */
export async function findByIds(ids) {
  if (ids.length === 0) return [];
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS} WHERE u.id = ANY($1::bigint[])`,
    [ids],
  );
  return rows;
}

/**
 * @param {string} email
 * @returns {Promise<UserRecord | null>}
 */
export async function findByEmail(email) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS} WHERE u.email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

/**
 * The only query that returns the password hash. Used exclusively by login.
 * @param {string} email
 * @returns {Promise<(UserRecord & { password_hash: string }) | null>}
 */
export async function findByEmailWithSecret(email) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, u.password_hash ${FROM_USERS} WHERE u.email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

/**
 * @param {{ name: string, email: string, passwordHash: string,
 *           role?: 'student' | 'handler' | 'admin', departmentId?: number | null }} input
 * @returns {Promise<UserRecord>}
 */
export async function create(input) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, department_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.name, input.email, input.passwordHash, input.role ?? 'student', input.departmentId ?? null],
  );
  const created = await findById(rows[0].id);
  return /** @type {UserRecord} */ (created);
}

/**
 * Handlers eligible to own a complaint in a department. Used by the assignment
 * dropdown and by the escalation job when it needs a fallback owner.
 *
 * @param {number | null} departmentId
 * @returns {Promise<UserRecord[]>}
 */
export async function listHandlers(departmentId) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS}
      WHERE u.is_active
        AND u.role IN ('handler', 'admin')
        AND ($1::bigint IS NULL OR u.department_id = $1 OR u.role = 'admin')
      ORDER BY u.role DESC, u.name ASC`,
    [departmentId],
  );
  return rows;
}

/**
 * Resolve an account that may own a complaint in the supplied department.
 * Active administrators may own any department; handlers must match exactly.
 * @param {number} userId
 * @param {number} departmentId
 * @returns {Promise<UserRecord | null>}
 */
export async function findAssignableHandler(userId, departmentId) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS}
      WHERE u.id = $1 AND u.is_active = TRUE
        AND (u.role = 'admin' OR (u.role = 'handler' AND u.department_id = $2))`,
    [userId, departmentId],
  );
  return rows[0] ?? null;
}

/**
 * @returns {Promise<UserRecord[]>}
 */
export async function listAdmins() {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS}
      WHERE u.role = 'admin' AND u.is_active
      ORDER BY u.created_at ASC`,
  );
  return rows;
}

/**
 * The level-2 escalation target: the account named by ESCALATION_L2_EMAIL if it
 * exists, otherwise the longest-serving active administrator.
 *
 * @param {string} [preferredEmail]
 * @returns {Promise<UserRecord | null>}
 */
export async function findEscalationAuthority(preferredEmail) {
  if (preferredEmail) {
    const preferred = await findByEmail(preferredEmail);
    if (preferred?.is_active) return preferred;
  }
  const admins = await listAdmins();
  return admins[0] ?? null;
}

/**
 * @param {number[]} ids
 * @returns {Promise<string[]>} active e-mail addresses for those users.
 */
export async function emailsFor(ids) {
  if (ids.length === 0) return [];
  const { rows } = await query(
    `SELECT email FROM users WHERE id = ANY($1::bigint[]) AND is_active`,
    [ids],
  );
  return rows.map((r) => r.email);
}

/**
 * Saves a hashed password-reset token for a user.
 * @param {string} email
 * @param {string} tokenHash  SHA-256 hex of the raw token
 * @param {Date} expiresAt
 */
export async function setPasswordResetToken(email, tokenHash, expiresAt) {
  await query(
    `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE email = $3`,
    [tokenHash, expiresAt, email],
  );
}

/**
 * Finds a user by a valid (unexpired) password-reset token hash.
 * @param {string} tokenHash
 * @returns {Promise<UserRecord | null>}
 */
export async function findByResetToken(tokenHash) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS}
     WHERE u.password_reset_token = $1
       AND u.password_reset_expires > now()
       AND u.is_active = TRUE`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/**
 * Updates password hash and clears reset token atomically.
 * @param {number} userId
 * @param {string} newPasswordHash
 */
export async function resetPassword(userId, newPasswordHash) {
  await query(
    `UPDATE users
     SET password_hash = $1,
         password_reset_token = NULL,
         password_reset_expires = NULL,
         updated_at = now()
     WHERE id = $2`,
    [newPasswordHash, userId],
  );
}
