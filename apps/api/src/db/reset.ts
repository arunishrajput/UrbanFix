/** Drops everything, re-runs migrations and seeds a fresh demo city. Development only. */
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { config } from '../config';
import { logger } from '../core/logger';
import { redis } from '../core/redis';
import { db, pool } from './client';
import { runMigrations } from './migrate';

async function reset() {
  if (config.isProd) throw new Error('db:reset is disabled in production');
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await redis.flushdb();
  if (config.STORAGE_DRIVER === 'local')
    await rm(path.join(config.UPLOAD_DIR, 'photos'), { recursive: true, force: true });
  await runMigrations();
  logger.info('schema recreated');
}

reset()
  .then(async () => {
    await pool.end();
    redis.disconnect();
    execFileSync(process.execPath, [...process.execArgv, path.join(import.meta.dirname, 'seed.ts')], {
      stdio: 'inherit',
    });
  })
  .catch(async (err) => {
    logger.error({ err }, 'reset failed');
    await pool.end();
    redis.disconnect();
    process.exitCode = 1;
  });
