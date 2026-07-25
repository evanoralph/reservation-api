import { env } from './config/env';
import { supabase } from './config/supabase';
import { app } from './app';

console.log('[server] Starting local server', {
  PORT: env.PORT,
  NODE_ENV: env.NODE_ENV,
  RESERVATION_TTL_MINUTES: env.RESERVATION_TTL_MINUTES,
  supabaseReady: Boolean(supabase),
});

app.listen(env.PORT, () => {
  console.log(
    `[server] Inventory Reservation API listening on http://localhost:${env.PORT}`,
  );
  console.log(`[server] Health check: http://localhost:${env.PORT}/health`);
});
