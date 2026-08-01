/**
 * @file src/middlewares/validate.ts
 * @description Zod-based request validation middleware factory.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from './errorHandler';

type RequestLocation = 'body' | 'query' | 'params';

/**
 * Returns an Express middleware that validates `req[location]`
 * against the provided Zod schema.
 *
 * Attaches the parsed (and typed) value back to `req[location]`.
 */
export function validate<T>(
  schema: ZodSchema<T>,
  location: RequestLocation = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[location]);

    if (!result.success) {
      const formatted = formatZodError(result.error);
      return next(new ValidationError('Request validation failed.', formatted));
    }

    // Overwrite with the parsed (coerced & stripped) value
    (req as Request & Record<string, unknown>)[location] = result.data;
    next();
  };
}

function formatZodError(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}
