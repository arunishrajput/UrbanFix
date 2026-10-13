import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests run the real Fastify app against Postgres + PostGIS and
 * Redis (DB 1). Jobs run inline, AI is off (heuristics), rate limits are off.
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://urbanfix:urbanfix@localhost:5432/urbanfix_test',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
      JOBS_MODE: 'inline',
      AI_ENABLED: 'false',
      RATE_LIMIT_ENABLED: 'false',
      GEOCODER_URL: 'http://127.0.0.1:9',
      UPLOAD_DIR: path.join(tmpdir(), 'urbanfix-test-uploads'),
      PUBLIC_API_URL: 'http://test.local',
    },
  },
});
