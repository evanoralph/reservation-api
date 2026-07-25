import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps async route handlers so rejected promises reach the error middleware.
 */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch((error: unknown) => {
      console.log('[asyncHandler] Caught async error', {
        method: req.method,
        path: req.path,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      next(error);
    });
  };
}
