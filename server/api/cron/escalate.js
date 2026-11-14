/**
 * Vercel Cron entry point for the SLA escalation sweep.
 *
 * This is the serverless replacement for `npm run escalate:cron`. The schedule
 * lives in `vercel.json`; Vercel calls this endpoint over plain HTTP, so it has
 * to authenticate the caller itself — without that check anyone who guessed the
 * URL could drive the escalation policy.
 *
 * The Chain of Responsibility itself is untouched: this is transport only.
 */
import { timingSafeEqual } from 'node:crypto';
import { runEscalationSweep } from '../../src/services/escalation/escalationService.js';
import { registerObservers } from '../../src/events/index.js';
import { logger } from '../../src/config/logger.js';

registerObservers();

/**
 * Constant-time comparison so the secret cannot be recovered a byte at a time.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * @param {import('http').IncomingMessage & { method?: string, headers: Record<string, any> }} req
 * @param {import('http').ServerResponse & { status: (c: number) => any, json: (b: any) => any }} res
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST' } });
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed. An unauthenticated endpoint that mutates every overdue
    // complaint is worse than a sweep that does not run.
    logger.error('CRON_SECRET is not set; refusing to run the escalation sweep');
    res.status(500).json({
      error: {
        code: 'CRON_SECRET_MISSING',
        message: 'CRON_SECRET is not configured for this deployment.',
      },
    });
    return;
  }

  const provided = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!provided || !safeEqual(provided, secret)) {
    logger.warn('Rejected an unauthenticated escalation sweep request');
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron credentials' } });
    return;
  }

  try {
    const report = await runEscalationSweep();
    logger.info('Scheduled sweep complete', {
      examined: report.examined,
      escalated: report.escalated,
      failed: report.failed,
    });
    res.status(200).json({
      ok: true,
      examined: report.examined,
      escalated: report.escalated,
      skipped: report.skipped,
      failed: report.failed,
      durationMs: report.durationMs,
    });
  } catch (error) {
    logger.error('Scheduled sweep failed', { error });
    res.status(500).json({ error: { code: 'SWEEP_FAILED', message: 'The escalation sweep failed' } });
  }

  // The pg pool is deliberately NOT closed here. A warm Function instance
  // serves many invocations, and ending the pool would leave every later one
  // throwing "Cannot use a pool after calling end on the pool" until the
  // instance recycled. Reusing the connection across invocations is the point.
  // Keep DATABASE_POOL_MAX small (1) and use a pooled connection string so
  // concurrent instances cannot exhaust Postgres — see DEPLOYMENT.md.
}
