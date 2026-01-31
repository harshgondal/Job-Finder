const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  GEMINI_API_KEY: z.string().optional(),
  JSEARCH_API_KEY: z.string().optional(),
  JSEARCH_API_HOST_URL: z.string().url().optional(),
  SERP_API_KEY: z.string().optional(),
  GLASSDOOR_RAPIDAPI_KEY: z.string().optional(),
  N8N_WEBHOOK_URL: z.string().url().optional(),
  CACHE_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  JOB_EMAIL_CRON: z.string().default('0 9 * * *'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
};

module.exports = { config };



