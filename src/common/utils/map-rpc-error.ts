import { AppError } from '../errors/app-error';
import { ErrorCodes, type ErrorCode } from '../errors/error-codes';

interface RpcErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

const RPC_ERROR_PREFIXES: Array<{ prefix: string; code: ErrorCode; message: string }> = [
  {
    prefix: 'INSUFFICIENT_INVENTORY',
    code: ErrorCodes.INSUFFICIENT_INVENTORY,
    message: 'The requested quantity is not available.',
  },
  {
    prefix: 'ITEM_NOT_FOUND',
    code: ErrorCodes.ITEM_NOT_FOUND,
    message: 'Item not found',
  },
  {
    prefix: 'RESERVATION_NOT_FOUND',
    code: ErrorCodes.RESERVATION_NOT_FOUND,
    message: 'Reservation not found',
  },
  {
    prefix: 'RESERVATION_EXPIRED',
    code: ErrorCodes.RESERVATION_EXPIRED,
    message: 'Reservation has expired',
  },
  {
    prefix: 'RESERVATION_ALREADY_CONFIRMED',
    code: ErrorCodes.RESERVATION_ALREADY_CONFIRMED,
    message: 'Reservation is already confirmed',
  },
  {
    prefix: 'INVALID_RESERVATION_STATE',
    code: ErrorCodes.INVALID_RESERVATION_STATE,
    message: 'Reservation is in an invalid state for this operation',
  },
  {
    prefix: 'VALIDATION_ERROR',
    code: ErrorCodes.VALIDATION_ERROR,
    message: 'Validation failed',
  },
];

/**
 * Maps PostgreSQL RAISE EXCEPTION messages (via Supabase RPC) to AppError.
 */
export function mapRpcError(error: RpcErrorLike, context: string): AppError {
  const combined = [error.message, error.details, error.hint].filter(Boolean).join(' | ');

  console.log('[mapRpcError] Mapping RPC error', {
    context,
    code: error.code,
    message: error.message,
  });

  for (const entry of RPC_ERROR_PREFIXES) {
    if (combined.includes(entry.prefix)) {
      return new AppError(entry.code, entry.message, {
        details: { context, dbMessage: error.message ?? null },
        cause: error,
      });
    }
  }

  console.error('[mapRpcError] Unmapped database error', { context, combined });
  return new AppError(ErrorCodes.DATABASE_ERROR, 'A database error occurred', {
    details: { context, message: error.message ?? null, code: error.code ?? null },
    cause: error,
  });
}
