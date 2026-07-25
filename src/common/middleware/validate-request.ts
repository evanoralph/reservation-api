import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error';

export interface RequestValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Validates request body/params/query with Zod and replaces them with parsed values.
 */
export function validateRequest(schemas: RequestValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    console.log('[validateRequest] Validating request', {
      method: req.method,
      path: req.path,
      hasBody: Boolean(schemas.body),
      hasParams: Boolean(schemas.params),
      hasQuery: Boolean(schemas.query),
    });

    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          throw AppError.validation('Request body validation failed', result.error.issues);
        }
        req.body = result.data;
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          throw AppError.validation('Request params validation failed', result.error.issues);
        }
        req.params = result.data as typeof req.params;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          throw AppError.validation('Request query validation failed', result.error.issues);
        }
        // Express types query as ParsedQs; overwrite with validated values for handlers.
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
