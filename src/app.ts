/**
 * @file src/app.ts
 * @description Express application factory.
 *              Sets up middleware, routes, and error handling.
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { logger } from './utils/logger';
import router from './routes';
import { globalErrorHandler, notFoundHandler } from './middlewares/errorHandler';
import { generalRateLimiter } from './middlewares/rateLimiter';

export function createApp(): Application {
  const app = express();

  const allowedOrigin = config.security.corsOrigin;
  const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

  // ─── Security Headers ──────────────────────────────────────
  app.use(helmet());

  // ─── CORS ─────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (origin === allowedOrigin || localOriginPattern.test(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  // ─── Rate Limiting ──────────────────────────────────
  // General limiter on all /api routes — AI routes get a stricter limiter in routes.ts
  app.use('/api', generalRateLimiter);

  // ─── Body Parsers ─────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ─── Request Logging ──────────────────────────────────────
  app.use((req: Request, _res: Response, next: express.NextFunction) => {
    logger.debug(`→ ${req.method} ${req.path}`, {
      query: req.query,
      ip: req.ip,
    });
    next();
  });

  // ─── Health Check ─────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] ?? '1.0.0',
        environment: config.nodeEnv,
      },
    });
  });

  // ─── API Routes ───────────────────────────────────────────
  app.use('/api', router);

  // ─── 404 Handler ──────────────────────────────────────────
  app.use(notFoundHandler);

  // ─── Global Error Handler (MUST be last) ──────────────────
  app.use(globalErrorHandler);

  return app;
}
