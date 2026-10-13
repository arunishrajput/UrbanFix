import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config';
import { logger } from '../core/logger';
import { db, pool } from './client';

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(config.apiRoot, 'drizzle') });
}

// Run directly: `pnpm db:migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => logger.info('migrations applied'))
    .catch((err) => {
      logger.error({ err }, 'migration failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
