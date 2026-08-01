/**
 * @file src/middlewares/errorHandler.ts
 * @description Global structured JSON error handler for Express.
 *              Must be registered LAST in the middleware chain.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_SERVER_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} with id "${id}" not found.` : `${resource} not found.`;
    super(msg, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class SafetyViolationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'SAFETY_VIOLATION', details);
    this.name = 'SafetyViolationError';
  }
}

// ─── Error Handler Middleware ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error('[ErrorHandler] Programming error detected.', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
    } else {
      logger.warn('[ErrorHandler] Operational error.', {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
      });
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(process.env['NODE_ENV'] !== 'production' && err.details !== undefined
          ? { details: err.details }
          : {}),
      },
    });
    return;
  }

  // Mongoose duplicate key error
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: number }).code === 11000
  ) {
    logger.warn('[ErrorHandler] Duplicate key error.', { path: req.path });
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'A record with these unique fields already exists.',
      },
    });
    return;
  }

  // Mongoose validation error
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'ValidationError'
  ) {
    const mongooseErr = (err as unknown) as { message: string };
    logger.warn('[ErrorHandler] Mongoose validation error.', { error: mongooseErr.message });

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: mongooseErr.message,
      },
    });
    return;
  }

  // Unknown / programming errors
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error('[ErrorHandler] Unhandled error.', {
    error: message,
    stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        process.env['NODE_ENV'] === 'production'
          ? 'An unexpected error occurred. Please try again later.'
          : message,
    },
  });
}

// ─── 404 Handler ────────────────────────────────────────────

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
}
