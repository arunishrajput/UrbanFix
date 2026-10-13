import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The apps/api directory, found by walking up to its package.json (works from src/ and bundled dist/). */
function findApiRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).name === '@urbanfix/api') return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
const apiRoot = process.env.API_ROOT ?? findApiRoot();

// Load apps/api/.env when present (Node >= 21.7). Real environment variables win.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile(path.join(apiRoot, '.env'));
  } catch {
    // no .env file — rely on the environment
  }
}

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const csv = (def: string) =>
  z
    .string()
    .default(def)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

const isProd = process.env.NODE_ENV === 'production';
/** Render injects the service's public URL; use it so single-service deploys need no URL config. */
const hostedUrl = process.env.RENDER_EXTERNAL_URL;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: bool(false),

  /** Public base URL of this API, used to build absolute links to uploaded photos. */
  PUBLIC_API_URL: z.url().default(hostedUrl ?? 'http://localhost:4000'),
  /** Allowed browser origins (CORS + Socket.IO), comma separated. */
  WEB_ORIGIN: csv(hostedUrl ?? 'http://localhost:5173'),
  /** Built web app (apps/web/dist). When set, the API also serves the SPA from the same origin. */
  WEB_DIST_DIR: z.string().optional(),

  DATABASE_URL: z.string().default('postgres://urbanfix:urbanfix@localhost:5432/urbanfix'),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: isProd
    ? z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
    : z.string().min(32).default('dev-only-access-secret-change-me-0123456789'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  COOKIE_SECURE: bool(isProd),

  /** `queue` runs background work on BullMQ (needs the worker); `inline` runs it in-process. */
  JOBS_MODE: z.enum(['queue', 'inline']).default('queue'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default(path.join(apiRoot, 'uploads')),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(10),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public base URL for objects in the bucket (CDN or bucket website endpoint). */
  S3_PUBLIC_URL: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  /** Tried in order; later models are fallbacks when earlier ones are overloaded. */
  GEMINI_MODELS: csv('gemini-flash-latest,gemini-flash-lite-latest'),
  GEMINI_EMBED_MODEL: z.string().default('gemini-embedding-2'),
  GEMINI_EMBED_DIMENSIONS: z.coerce.number().int().default(768),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().default(20_000),
  AI_ENABLED: bool(true),

  GEOCODER_URL: z.url().default('https://nominatim.openstreetmap.org'),
  GEOCODER_USER_AGENT: z.string().default('UrbanFix/0.1 (civic issue reporting)'),
  GEOCODER_EMAIL: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@urbanfix.local'),

  CITY_NAME: z.string().default('Pune'),
  CITY_LAT: z.coerce.number().default(18.5204),
  CITY_LNG: z.coerce.number().default(73.8567),

  RATE_LIMIT_ENABLED: bool(true),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  aiAvailable: parsed.data.AI_ENABLED && Boolean(parsed.data.GEMINI_API_KEY),
  pushAvailable: Boolean(parsed.data.VAPID_PUBLIC_KEY && parsed.data.VAPID_PRIVATE_KEY),
  apiRoot,
};
export type Config = typeof config;
