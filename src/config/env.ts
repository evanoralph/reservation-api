import 'dotenv/config';
import { z } from 'zod';

/**
 * Validates process.env at startup.
 * Never log SUPABASE_SERVICE_ROLE_KEY.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string({ error: 'SUPABASE_SERVICE_ROLE_KEY is required' })
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

function formatEnvIssues(issues: z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
}

function loadEnv(): Env {
  console.log('[env] Validating environment variables');

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = formatEnvIssues(result.error.issues);
    console.error(`[env] Invalid environment configuration:\n${details}`);
    console.error(
      '[env] Copy .env.example to .env and set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  // Log non-secret config only
  console.log('[env] Environment validated', {
    NODE_ENV: result.data.NODE_ENV,
    PORT: result.data.PORT,
    RESERVATION_TTL_MINUTES: result.data.RESERVATION_TTL_MINUTES,
    SUPABASE_URL: result.data.SUPABASE_URL,
    hasServiceRoleKey: true,
  });

  return result.data;
}

export const env = loadEnv();
