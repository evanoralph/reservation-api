import { env } from '../src/config/env';
import '../src/config/supabase';
import { app } from '../src/app';

console.log('[vercel] Serverless Express app exported', {
  NODE_ENV: env.NODE_ENV,
  RESERVATION_TTL_MINUTES: env.RESERVATION_TTL_MINUTES,
});

/**
 * Vercel serverless entry point.
 * vercel.json rewrites all routes to /api.
 */
export default app;
