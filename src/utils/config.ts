// Configuration validation and management

import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().min(1).max(65535).default(3100),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  REQUEST_TIMEOUT: z.coerce.number().min(1000).max(120000).default(30000),
  MAX_REQUEST_SIZE: z.string().default('10mb'),
  LEGIFRANCE_CLIENT_ID: z.string().optional(),
  LEGIFRANCE_CLIENT_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

let config: Config | null = null;

export function loadConfig(): Config {
  if (config) return config;

  try {
    config = configSchema.parse({
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      REQUEST_TIMEOUT: process.env.REQUEST_TIMEOUT,
      MAX_REQUEST_SIZE: process.env.MAX_REQUEST_SIZE,
      LEGIFRANCE_CLIENT_ID: process.env.LEGIFRANCE_CLIENT_ID,
      LEGIFRANCE_CLIENT_SECRET: process.env.LEGIFRANCE_CLIENT_SECRET,
    });

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      for (const issue of error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
    }
    throw new Error('Invalid configuration');
  }
}

export function getConfig(): Config {
  if (!config) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return config;
}
