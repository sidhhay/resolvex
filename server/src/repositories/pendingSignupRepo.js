/** Data access for email-verified, not-yet-created student accounts. */
import { query } from '../config/db.js';

export async function savePendingSignup({ name, email, passwordHash, codeHash, expiresAt }) {
  await query(
    `INSERT INTO pending_signups (email, name, password_hash, code_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, now())
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       code_hash = EXCLUDED.code_hash,
       expires_at = EXCLUDED.expires_at,
       attempts = 0,
       created_at = now()`,
    [email, name, passwordHash, codeHash, expiresAt],
  );
}

export async function findPendingSignup(email) {
  const { rows } = await query(
    'SELECT email, name, password_hash, code_hash, expires_at, attempts FROM pending_signups WHERE email = $1',
    [email],
  );
  return rows[0] ?? null;
}

export async function incrementAttempts(email) {
  const { rows } = await query(
    'UPDATE pending_signups SET attempts = attempts + 1 WHERE email = $1 RETURNING attempts',
    [email],
  );
  return rows[0]?.attempts ?? 0;
}

export async function deletePendingSignup(email) {
  await query('DELETE FROM pending_signups WHERE email = $1', [email]);
}
