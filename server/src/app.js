/**
 * Express application.
 *
 * Exported separately from the server bootstrap so tests can mount the app
 * without opening a port or attaching Socket.IO.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { ForbiddenError } from './domain/errors.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { isCloudinaryEnabled } from './services/uploadService.js';

/**
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  // Behind a load balancer, req.ip must reflect X-Forwarded-For or every
  // rate-limit bucket collapses onto the proxy's address.
  app.set('trust proxy', config.isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON and (in development) uploaded images to a SPA on a
      // different origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin, curl and server-to-server requests send no Origin header.
        if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
        // A ForbiddenError (not a bare Error) so the rejection surfaces as a
        // clean 403 with an actionable message. A plain Error here reaches the
        // handler as an *unexpected* fault and is reported as a 500, which
        // sends anyone debugging a CORS misconfiguration hunting a server bug.
        logger.warn('Blocked a cross-origin request', { origin, allowed: config.clientOrigins });
        return callback(
          new ForbiddenError(
            `Origin ${origin} is not permitted. Add it to CLIENT_ORIGIN to allow it.`,
          ),
        );
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // Correlates every log line for one request.
  app.use((req, res, next) => {
    req.requestId = req.get('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', req.requestId);
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.debug('Request', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - startedAt,
      });
    });
    next();
  });

  // Locally stored attachments. Not used when Cloudinary is configured, which
  // is the production recommendation: user-supplied files served from the API's
  // own origin are an XSS vector no matter how carefully they are sniffed.
  if (!isCloudinaryEnabled()) {
    app.use(
      '/uploads',
      express.static(path.resolve(process.cwd(), config.uploads.localDir), {
        index: false,
        dotfiles: 'deny',
        maxAge: '1h',
        setHeaders(res) {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        },
      }),
    );
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
