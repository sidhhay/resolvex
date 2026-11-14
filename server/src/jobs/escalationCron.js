#!/usr/bin/env node
/**
 * Standalone escalation worker.
 *
 *   node src/jobs/escalationCron.js --once   run one sweep and exit (cron/CI)
 *   node src/jobs/escalationCron.js          run on ESCALATION_CRON forever
 *
 * Deploy this as its own process (or a Kubernetes CronJob with `--once`) and
 * set ESCALATION_IN_PROCESS=false on the API. Several API replicas each running
 * their own scheduler would sweep the same rows concurrently — harmless thanks
 * to the UNIQUE (complaint_id, level) guard, but wasteful.
 *
 * This is the Chain of Responsibility's entry point; the policy itself lives in
 * services/escalation/chain.js.
 */
import cron from 'node-cron';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { assertDatabaseReachable, closePool } from '../config/db.js';
import { registerObservers } from '../events/index.js';
import { runEscalationSweep } from '../services/escalation/escalationService.js';

const runOnce = process.argv.includes('--once');

async function main() {
  await assertDatabaseReachable();

  // The worker has no Socket.IO server, so the socket observer is a no-op here;
  // notification rows and e-mails still go out, and connected clients pick the
  // change up from the API process on their next poll or reconnect.
  registerObservers();

  if (runOnce) {
    const report = await runEscalationSweep();
    logger.info('Sweep finished', {
      examined: report.examined,
      escalated: report.escalated,
      skipped: report.skipped,
      failed: report.failed,
    });
    // Give the non-blocking observers (e-mail) a moment to drain before exit.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await closePool();
    process.exit(report.failed > 0 ? 1 : 0);
  }

  if (!cron.validate(config.sla.cronExpression)) {
    throw new Error(`ESCALATION_CRON is not a valid cron expression: "${config.sla.cronExpression}"`);
  }

  const task = cron.schedule(
    config.sla.cronExpression,
    async () => {
      await runEscalationSweep();
    },
    { name: 'sla-escalation-sweep', timezone: config.sla.cronTimezone, noOverlap: true },
  );

  logger.info('Escalation worker started', {
    cron: config.sla.cronExpression,
    timezone: config.sla.cronTimezone,
    level1Days: config.sla.level1Days,
    level2Days: config.sla.level2Days,
    nextRun: task.getNextRun()?.toISOString() ?? null,
  });

  /** @param {string} signal */
  const stop = async (signal) => {
    logger.info(`Received ${signal}, stopping escalation worker`);
    await task.stop();
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

main().catch(async (error) => {
  logger.error('Escalation worker failed to start', { error });
  await closePool().catch(() => {});
  process.exit(1);
});
