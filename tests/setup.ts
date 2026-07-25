import { config } from 'dotenv';

config();

process.env.NODE_ENV = 'test';

console.log('[tests/setup] Test environment loaded', {
  hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
  hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
});
