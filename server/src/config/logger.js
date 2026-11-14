/**
 * Minimal structured logger.
 *
 * Pretty, colourised lines in development; single-line JSON in production so a
 * log shipper can parse it. Deliberately dependency-free — a grievance system
 * should not pull a logging framework in for six functions.
 */

/** @typedef {'debug' | 'info' | 'warn' | 'error'} LogLevel */

/** @type {Record<LogLevel, number>} */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const CONFIGURED = /** @type {LogLevel} */ (
  LEVELS[/** @type {LogLevel} */ (process.env.LOG_LEVEL ?? '')] ? process.env.LOG_LEVEL : 'info'
);
const THRESHOLD = LEVELS[CONFIGURED];
const AS_JSON = process.env.NODE_ENV === 'production';

const COLOURS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

/**
 * Strips values that must never reach a log sink, however deeply nested.
 * @param {unknown} value
 * @returns {unknown}
 */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = /password|token|secret|authorization|api[_-]?key|hash/i.test(key)
        ? '[redacted]'
        : redact(item);
    }
    return out;
  }
  return value;
}

/**
 * @param {LogLevel} level
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
function emit(level, message, meta) {
  if (LEVELS[level] < THRESHOLD) return;
  const payload = meta ? /** @type {Record<string, unknown>} */ (redact(meta)) : undefined;
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

  if (AS_JSON) {
    stream.write(`${JSON.stringify({ ts: new Date().toISOString(), level, message, ...payload })}\n`);
    return;
  }
  const tail = payload && Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : '';
  stream.write(`${COLOURS[level]}${level.toUpperCase().padEnd(5)}${RESET} ${message}${tail}\n`);
}

export const logger = {
  /** @param {string} m @param {Record<string, unknown>} [meta] */ debug: (m, meta) => emit('debug', m, meta),
  /** @param {string} m @param {Record<string, unknown>} [meta] */ info: (m, meta) => emit('info', m, meta),
  /** @param {string} m @param {Record<string, unknown>} [meta] */ warn: (m, meta) => emit('warn', m, meta),
  /** @param {string} m @param {Record<string, unknown>} [meta] */ error: (m, meta) => emit('error', m, meta),
};
