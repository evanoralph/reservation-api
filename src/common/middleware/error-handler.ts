import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { errorResponse } from '../types/api-response';
import { env } from '../../config/env';
import { logger } from '../utils/logger';

/**
 * Global error middleware. Production responses never include stack traces.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.warn(
      {
        code: err.code,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        details: err.details,
      },
      `[errorHandler] AppError: ${err.message}`,
    );

    res.status(err.statusCode).json(errorResponse(err.code, err.message, err.details));
    return;
  }

  if (err instanceof ZodError) {
    logger.warn(
      { path: req.path, method: req.method, issues: err.issues },
      '[errorHandler] ZodError',
    );

    res
      .status(422)
      .json(
        errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'Request validation failed',
          err.issues,
        ),
      );
    return;
  }

  const message =
    err instanceof Error ? err.message : 'An unexpected error occurred';
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error(
    {
      path: req.path,
      method: req.method,
      err,
      stack: env.NODE_ENV === 'production' ? undefined : stack,
    },
    `[errorHandler] Unhandled error: ${message}`,
  );

  const clientMessage =
    env.NODE_ENV === 'production' ? 'An unexpected error occurred' : message;

  res
    .status(500)
    .json(
      errorResponse(ErrorCodes.INTERNAL_SERVER_ERROR, clientMessage, null),
    );
}
