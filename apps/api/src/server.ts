import { config } from './config';
import { buildApp } from './app';
import { closeQueues } from './core/jobs';
import { closeRealtime, attachRealtime } from './core/realtime';
import { redis } from './core/redis';
import { pool } from './db/client';
import { runMigrations } from './db/migrate';

async function main() {
  if (process.env.MIGRATE_ON_START === 'true') await runMigrations();
  const app = await buildApp();
  attachRealtime(app.server);
  await app.listen({ host: config.HOST, port: config.PORT });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    await closeRealtime();
    await app.close();
    await closeQueues();
    await pool.end();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
