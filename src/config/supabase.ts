import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

console.log('[supabase] Creating Supabase server client');

/**
 * Server-side Supabase client using the service role key.
 * Use only on the server — never expose this client or key to browsers.
 */
export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

console.log('[supabase] Supabase client ready (service role; key not logged)');
