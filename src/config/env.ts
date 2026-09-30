import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1).default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  JWT_SECRET: z.string().min(16),
  WEBHOOK_SECRET: z.string().min(8),
  MOCK_LATENCY_MS: z.coerce.number().int().nonnegative().default(20),
  DISPATCH_CONCURRENCY: z.coerce.number().int().positive().default(5),
  DISPATCH_ATTEMPTS: z.coerce.number().int().positive().default(3),
  MOCK_REJECT_TO: z.string().optional().default(''),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Ambiente inválido: ${details}`);
  }
  return parsed.data;
}
