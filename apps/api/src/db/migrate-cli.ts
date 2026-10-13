/** `pnpm db:migrate` / `node dist/migrate.js` — applies pending migrations and exits. */
import { logger } from '../core/logger';
import { redis } from '../core/redis';
import { pool } from './client';
import { runMigrations } from './migrate';

runMigrations()
  .then(() => logger.info('migrations applied'))
  .catch((err) => {
    logger.error({ err }, 'migration failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
