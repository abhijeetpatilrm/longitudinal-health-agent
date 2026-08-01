/**
 * @file src/middlewares/rateLimiter.ts
 * @description Express rate limiting middleware using `express-rate-limit`.
 *
 * Exports:
 *   - `aiRateLimiter`      — 15 req / 15 min per IP, applied to AI routes
 *   - `generalRateLimiter` — 200 req / min per IP, applied globally
 *
 * In test environments, rate limiting is disabled (NODE_ENV === 'test').
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

/** Shared handler for when the rate limit is exceeded. */
function rateLimitExceededHandler(
  req: Request,
  res: Response,
  _next: unknown,
  options: { message: string }
): void {
  logger.warn('[RateLimit] Rate limit exceeded.', {
    ip: req.ip,
    path: req.path,
    method: req.method,
    limit: options.message,
  });

  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: options.message,
      retryAfter: res.getHeader('Retry-After'),
    },
  });
}

const isTest = process.env['NODE_ENV'] === 'test';

/**
 * AI Route Rate Limiter — 15 requests per 15-minute window per IP.
 * Applied to: POST /extract-meals, POST /generate
 *
 * In test mode, this is a pass-through (limit set to 10,000).
 */
export const aiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,     // 15 minutes
  max: isTest ? 10_000 : 15,    // Disabled in test env
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) =>
    rateLimitExceededHandler(req, res, next, {
      message: `Too many AI requests. Maximum 15 requests per 15 minutes. Please wait ${Math.ceil(options.windowMs / 60000)} minutes and try again.`,
    }),
  skip: () => isTest,
});

/**
 * General API Rate Limiter — 200 requests per minute per IP.
 * Applied globally in app.ts.
 *
 * In test mode, this is a pass-through.
 */
export const generalRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,          // 1 minute
  max: isTest ? 10_000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, _options) =>
    rateLimitExceededHandler(req, res, next, {
      message: `Too many requests from this IP. Maximum ${isTest ? 10000 : 200} requests per minute.`,
    }),
  skip: () => isTest,
});
