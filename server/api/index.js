/**
 * Vercel serverless entry point for the REST API.
 *
 * An Express app *is* a `(req, res)` handler, so it can be exported directly as
 * a Vercel Function. `vercel.json` rewrites every path to this file, so the app
 * still sees the original URL and its own `/api/...` mounts line up.
 *
 * What is deliberately NOT here, and why:
 *
 *   • `server.listen()` — Vercel owns the HTTP server.
 *   • Socket.IO — a Function is request-scoped, so there is no process to hold a
 *     websocket open, and room membership could not be shared between
 *     invocations even over long-polling. The socket observer degrades to a
 *     no-op on its own (`emitToRooms` returns early when `getIO()` is null), so
 *     transitions, notification rows and e-mail all still work; clients fall
 *     back to polling. See DEPLOYMENT.md.
 *   • `node-cron` — replaced by a Vercel Cron Job hitting `api/cron/escalate.js`.
 *   • `verifyMailer()` — an SMTP handshake on every cold start is latency for no
 *     benefit; the transport is created lazily on first send anyway.
 *
 * Observers are registered at module scope so it happens once per cold start
 * rather than once per request. `registerObservers()` is idempotent regardless.
 */
import { createApp } from '../src/app.js';
import { registerObservers } from '../src/events/index.js';

registerObservers();

const app = createApp();

export default app;
