import { ErrorCodes, ErrorStatusMap, type ErrorCode } from './error-codes';

/**
 * Application error with stable code + HTTP status for API responses.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: unknown;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options?.statusCode ?? ErrorStatusMap[code] ?? 500;
    this.details = options?.details ?? null;
    this.isOperational = true;

    console.log('[AppError] created', {
      code: this.code,
      statusCode: this.statusCode,
      message: this.message,
    });
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ErrorCodes.VALIDATION_ERROR, message, { details });
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(ErrorCodes.NOT_FOUND, message);
  }

  static internal(message = 'An unexpected error occurred', details?: unknown): AppError {
    return new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, message, { details });
  }
}
