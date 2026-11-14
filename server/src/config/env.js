/**
 * Environment loading and validation.
 *
 * The process fails fast at boot with an aggregated list of every problem,
 * rather than dying later on the first request that touches a missing value.
 */
import 'dotenv/config';

/** @type {string[]} */
const problems = [];

/**
 * @param {string} name
 * @param {{ min?: number }} [opts]
 * @returns {string}
 */
function required(name, opts = {}) {
  const value = (process.env[name] ?? '').trim();
  if (!value) {
    problems.push(`${name} is required but not set`);
    return '';
  }
  if (opts.min && value.length < opts.min) {
    problems.push(`${name} must be at least ${opts.min} characters (got ${value.length})`);
  }
  return value;
}

/**
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function optional(name, fallback) {
  const value = (process.env[name] ?? '').trim();
  return value || fallback;
}

/**
 * @param {string} name
 * @param {number} fallback
 * @param {{ min?: number, max?: number }} [range]
 * @returns {number}
 */
function numeric(name, fallback, range = {}) {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    problems.push(`${name} must be a number (got "${raw}")`);
    return fallback;
  }
  if (range.min !== undefined && value < range.min) {
    problems.push(`${name} must be >= ${range.min} (got ${value})`);
  }
  if (range.max !== undefined && value > range.max) {
    problems.push(`${name} must be <= ${range.max} (got ${value})`);
  }
  return value;
}

/**
 * @param {string} name
 * @param {boolean} fallback
 * @returns {boolean}
 */
function boolean(name, fallback) {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

const PLACEHOLDER_SECRET = 'change-me-to-a-long-random-string-at-least-32-chars';
const jwtSecret = required('JWT_SECRET', { min: 32 });
if (isProduction && jwtSecret === PLACEHOLDER_SECRET) {
  problems.push('JWT_SECRET is still the .env.example placeholder — generate one with `openssl rand -hex 32`');
}

const slaLevel1Days = numeric('SLA_LEVEL1_DAYS', 3, { min: 0.01 });
const slaLevel2Days = numeric('SLA_LEVEL2_DAYS', 5, { min: 0.01 });
if (slaLevel2Days <= slaLevel1Days) {
  problems.push(`SLA_LEVEL2_DAYS (${slaLevel2Days}) must be greater than SLA_LEVEL1_DAYS (${slaLevel1Days})`);
}

export const config = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: numeric('PORT', 4000, { min: 1, max: 65535 }),

  /** Origins allowed by CORS and by the Socket.IO handshake. */
  clientOrigins: optional('CLIENT_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  db: {
    connectionString: required('DATABASE_URL'),
    /** Verify the server certificate unless explicitly relaxed (managed PG often needs this off). */
    ssl: boolean('DATABASE_SSL', false),
    poolMax: numeric('DATABASE_POOL_MAX', 10, { min: 1, max: 100 }),
    idleTimeoutMs: numeric('DATABASE_IDLE_TIMEOUT_MS', 30_000, { min: 1000 }),
    connectionTimeoutMs: numeric('DATABASE_CONNECTION_TIMEOUT_MS', 10_000, { min: 500 }),
    slowQueryMs: numeric('DATABASE_SLOW_QUERY_MS', 400, { min: 1 }),
  },

  auth: {
    jwtSecret,
    jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),
    bcryptRounds: numeric('BCRYPT_ROUNDS', 10, { min: 8, max: 15 }),
    /** Registration through the public endpoint is limited to this role. */
    selfServiceRole: /** @type {'student'} */ ('student'),
  },

  sla: {
    /** Chain of Responsibility thresholds, in days of inactivity. */
    level1Days: slaLevel1Days,
    level2Days: slaLevel2Days,
    /** Target used by the admin analytics "SLA compliance" metric, in days. */
    resolutionTargetDays: numeric('SLA_RESOLUTION_TARGET_DAYS', 7, { min: 0.01 }),
    /** Standard 5-field cron expression for the escalation sweep. */
    cronExpression: optional('ESCALATION_CRON', '0 * * * *'),
    cronTimezone: optional('ESCALATION_CRON_TZ', 'UTC'),
    /** Explicit level-2 (Dean / Director) recipient; falls back to the oldest admin. */
    level2Email: optional('ESCALATION_L2_EMAIL', ''),
    /** Rows examined per sweep — bounds the job's memory and runtime. */
    sweepBatchSize: numeric('ESCALATION_BATCH_SIZE', 200, { min: 1, max: 5000 }),
    /**
     * Run the sweep inside the API process. Convenient in development; in
     * production run `npm run escalate:cron` as its own worker so N API
     * replicas do not each sweep the same table.
     */
    runInProcess: boolean('ESCALATION_IN_PROCESS', !isProduction),
  },

  ai: {
    anthropicApiKey: optional('ANTHROPIC_API_KEY', ''),
    anthropicModel: optional('ANTHROPIC_MODEL', 'claude-opus-5'),
    openaiApiKey: optional('OPENAI_API_KEY', ''),
    openaiModel: optional('OPENAI_MODEL', 'gpt-4o-mini'),
    openaiBaseUrl: optional('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    /** Hard ceiling per classification attempt; the strategy aborts and falls back. */
    timeoutMs: numeric('AI_TIMEOUT_MS', 8_000, { min: 500, max: 60_000 }),
    /** Below this confidence the LLM verdict is discarded in favour of keywords. */
    minConfidence: numeric('AI_MIN_CONFIDENCE', 0.35, { min: 0, max: 1 }),
    /** Set to false to run purely on the rule-based engine (useful in CI). */
    enabled: boolean('AI_ENABLED', true),
  },

  mail: {
    enabled: boolean('MAIL_ENABLED', false),
    host: optional('SMTP_HOST', ''),
    port: numeric('SMTP_PORT', 587, { min: 1, max: 65535 }),
    secure: boolean('SMTP_SECURE', false),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    from: optional('MAIL_FROM', 'ResolveX <no-reply@resolvex.edu>'),
    /** Deep links in e-mails point back at the SPA. */
    appUrl: optional('APP_URL', 'http://localhost:5173'),
  },

  uploads: {
    cloudinaryCloudName: optional('CLOUDINARY_CLOUD_NAME', ''),
    cloudinaryApiKey: optional('CLOUDINARY_API_KEY', ''),
    cloudinaryApiSecret: optional('CLOUDINARY_API_SECRET', ''),
    cloudinaryFolder: optional('CLOUDINARY_FOLDER', 'resolvex/complaints'),
    maxBytes: numeric('UPLOAD_MAX_BYTES', 10 * 1024 * 1024, { min: 1024 }),
    /** Local fallback directory used when Cloudinary is not configured. */
    localDir: optional('UPLOAD_DIR', 'uploads'),
    allowedMimeTypes: optional(
      'UPLOAD_ALLOWED_MIME',
      'image/jpeg,image/png,image/webp,image/gif,application/pdf',
    )
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  },

  rateLimit: {
    windowMs: numeric('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, { min: 1000 }),
    authMaxAttempts: numeric('RATE_LIMIT_AUTH_MAX', 10, { min: 1 }),
    writeMaxRequests: numeric('RATE_LIMIT_WRITE_MAX', 60, { min: 1 }),
  },
};

if (problems.length > 0) {
  const detail = problems.map((p) => `  • ${p}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${detail}\n\nSee server/.env.example for the full list.`);
}

/** @typedef {typeof config} AppConfig */
