/**
 * PostgreSQL access layer — a single pooled connection shared process-wide.
 *
 * Everything that touches the database goes through `query` or `withTransaction`
 * so that timing, slow-query warnings and error translation live in exactly one
 * place. Repositories never construct their own clients.
 */
import pg from 'pg';
import { config } from './env.js';
import { logger } from './logger.js';
import { ConflictError } from '../domain/errors.js';

const { Pool, types } = pg;

// node-postgres returns BIGINT (OID 20) as a string to avoid precision loss.
// Our ids comfortably fit in a JS number, and returning strings would leak
// `"id": "12"` into every API response, so parse them back to numbers.
types.setTypeParser(20, (value) => Number.parseInt(value, 10));
// NUMERIC (OID 1700) — used only for ai_confidence, always within float range.
types.setTypeParser(1700, (value) => (value === null ? null : Number.parseFloat(value)));

export const pool = new Pool({
  connectionString: config.db.connectionString,
  ssl: config.db.ssl ? { rejectUnauthorized: true } : undefined,
  max: config.db.poolMax,
  idleTimeoutMillis: config.db.idleTimeoutMs,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
});

// An idle client erroring out (network blip, server restart) must not take the
// process down — the pool discards it and the next checkout gets a fresh one.
pool.on('error', (error) => {
  logger.error('Idle PostgreSQL client error', { error });
});

/**
 * Translates the PostgreSQL error codes we deliberately rely on into domain
 * errors, so a race that trips a UNIQUE constraint surfaces as a clean 409
 * instead of a 500.
 *
 * @param {unknown} error
 * @returns {unknown}
 */
export function translateDbError(error) {
  const pgError = /** @type {{ code?: string, constraint?: string, detail?: string }} */ (error);
  if (pgError?.code === '23505') {
    // Unique violation. `escalations_complaint_level_key` is the expected one:
    // it is the idempotency guard for the escalation sweep.
    return new ConflictError('This record already exists', { constraint: pgError.constraint });
  }
  if (pgError?.code === '23503') {
    return new ConflictError('Referenced record does not exist', { constraint: pgError.constraint });
  }
  return error;
}

/**
 * Runs a parameterised query. Always pass values through `params` — string
 * interpolation into SQL is never acceptable here.
 *
 * @template {import('pg').QueryResultRow} [R=any]
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<import('pg').QueryResult<R>>}
 */
export async function query(text, params = []) {
  const startedAt = process.hrtime.bigint();
  try {
    const result = await pool.query(text, params);
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (elapsedMs > config.db.slowQueryMs) {
      logger.warn('Slow query', { elapsedMs: Math.round(elapsedMs), sql: squash(text) });
    }
    return result;
  } catch (error) {
    logger.error('Query failed', { sql: squash(text), error });
    throw translateDbError(error);
  }
}

/**
 * Runs `fn` inside a single transaction on a dedicated client, committing on
 * success and rolling back on any throw. Used wherever a state change spans
 * more than one table — a complaint transition writes the complaint row, an
 * audit row and (for escalations) an escalation row, and either all of them
 * land or none do.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // A failed rollback means the connection is unusable; log and move on —
      // release() below discards it rather than returning it to the pool.
      logger.error('Rollback failed', { error: rollbackError });
    }
    throw translateDbError(error);
  } finally {
    client.release();
  }
}

/**
 * Verifies connectivity at boot so the process fails loudly rather than
 * serving 500s.
 * @returns {Promise<void>}
 */
export async function assertDatabaseReachable() {
  const { rows } = await query('SELECT current_database() AS db, version() AS version');
  logger.info('Connected to PostgreSQL', {
    database: rows[0]?.db,
    version: String(rows[0]?.version ?? '').split(' ').slice(0, 2).join(' '),
  });
}

/** Closes the pool during graceful shutdown. @returns {Promise<void>} */
export async function closePool() {
  await pool.end();
}

/** @param {string} sql @returns {string} */
function squash(sql) {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 240);
}
