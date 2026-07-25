import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

/**
 * Catch-all for unmatched routes → standard 404 AppError.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  console.log('[notFound] No route matched', { method: req.method, path: req.path });
  next(AppError.notFound(`Route not found: ${req.method} ${req.path}`));
}
