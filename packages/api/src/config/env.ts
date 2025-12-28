import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10)),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  RATE_LIMIT_MAX: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10)),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  APP_VERSION: z.string().optional().default('0.1.0'),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    process.stderr.write('❌ Environment validation failed:\n');
    for (const issue of result.error.issues) {
      process.stderr.write(`  - ${issue.path.join('.')}: ${issue.message}\n`);
    }
    process.exit(1);
  }

  validatedEnv = result.data;
  return validatedEnv;
}

export function getEnv(): Env {
  if (process.env.NODE_ENV === 'test') {
    validatedEnv = null;
  }
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}

export function resetEnv(): void {
  validatedEnv = null;
}
