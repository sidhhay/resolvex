/**
 * Server bootstrap.
 *
 *   express app  ─┐
 *                 ├─▶ node:http server ─▶ Socket.IO
 *   observers    ─┘
 *
 * Socket.IO shares the HTTP server rather than binding its own port, so one
 * origin and one TLS certificate cover both the REST API and the websocket.
 */
import http from 'node:http';
import cron from 'node-cron';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { assertDatabaseReachable, closePool } from './config/db.js';
import { createApp } from './app.js';
import { initSocket, closeSocket } from './realtime/socket.js';
import { registerObservers } from './events/index.js';
import { verifyMailer } from './services/mailer.js';
import { runEscalationSweep } from './services/escalation/escalationService.js';

const app = createApp();
const server = http.createServer(app);

/** @type {import('node-cron').ScheduledTask | null} */
let escalationTask = null;

async function start() {
  // Fail fast on an unreachable database rather than serving 500s.
  // await assertDatabaseReachable();

  initSocket(server);
  registerObservers();
  await verifyMailer();

  if (config.sla.runInProcess) {
    if (!cron.validate(config.sla.cronExpression)) {
      throw new Error(`ESCALATION_CRON is not a valid cron expression: "${config.sla.cronExpression}"`);
    }
    escalationTask = cron.schedule(
      config.sla.cronExpression,
      async () => {
        await runEscalationSweep();
      },
      {
        name: 'sla-escalation-sweep',
        timezone: config.sla.cronTimezone,
        // A slow sweep must never overlap the next tick and double-process.
        noOverlap: true,
      },
    );
    logger.info('Escalation sweep scheduled in-process', {
      cron: config.sla.cronExpression,
      timezone: config.sla.cronTimezone,
      level1Days: config.sla.level1Days,
      level2Days: config.sla.level2Days,
    });
  }

  server.listen(config.port, config.host, () => {
    logger.info(`ResolveX API listening on ${config.host}:${config.port}`, {
      env: config.nodeEnv,
      origins: config.clientOrigins,
    });
  });
}

/**
 * Graceful shutdown: stop accepting work, then release the pool so in-flight
 * transactions can commit instead of being severed mid-write.
 * @param {string} signal
 */
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out; exiting');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    await escalationTask?.stop();
    await new Promise((resolve) => server.close(() => resolve(null)));
    await closeSocket();
    await closePool();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// An unhandled rejection leaves the process in an unknown state; log loudly and
// let the supervisor restart it rather than limping on.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: reason });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception — exiting', { error });
  process.exit(1);
});

start().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});
