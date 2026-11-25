/**
 * Data access for email-OTP login codes.
 */
import { query } from '../config/db.js';

/**
 * Upserts a new OTP for the given user, replacing any previous one.
 * @param {number} userId
 * @param {string} codeHash  SHA-256 hex of the 6-digit code
 * @param {Date} expiresAt
 */
export async function upsertOtp(userId, codeHash, expiresAt, purpose = 'login') {
  await query(
    `INSERT INTO auth_otps (user_id, code_hash, expires_at, used, purpose)
     VALUES ($1, $2, $3, FALSE, $4)
     ON CONFLICT (user_id, purpose) DO UPDATE
       SET code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           used = FALSE,
           created_at = now()`,
    [userId, codeHash, expiresAt, purpose],
  );
}

/**
 * Returns the active (unused, unexpired) OTP row for a user.
 * @param {number} userId
 */
export async function findActiveOtp(userId, purpose = 'login') {
  const { rows } = await query(
    `SELECT * FROM auth_otps
     WHERE user_id = $1 AND purpose = $2 AND used = FALSE AND expires_at > now()`,
    [userId, purpose],
  );
  return rows[0] ?? null;
}

/**
 * Marks the OTP as used so it cannot be replayed.
 * @param {number} userId
 */
export async function consumeOtp(userId, purpose = 'login') {
  await query(
    `UPDATE auth_otps SET used = TRUE WHERE user_id = $1 AND purpose = $2`,
    [userId, purpose],
  );
}
