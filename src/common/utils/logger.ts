import pino from 'pino';
import { env } from '../../config/env';

/**
 * Shared structured logger. Prefer this over ad-hoc console in request paths.
 */
export const logger = pino({
  level:
    env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: {
    service: 'inventory-reservation-api',
    env: env.NODE_ENV,
  },
});

logger.info('[logger] Pino logger initialized');
