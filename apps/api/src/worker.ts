/**
 * Background worker: consumes the BullMQ queues and runs scheduled maintenance.
 * Scale it independently of the API (`pnpm start:worker`).
 */
import { Worker } from 'bullmq';
import './jobs';
import { config } from './config';
import { QUEUES, closeQueues, getJobHandler, getQueue, type QueueName } from './core/jobs';
import { logger } from './core/logger';
import { createBullConnection, redis } from './core/redis';
import { pool } from './db/client';

if (config.JOBS_MODE !== 'queue') {
  logger.warn('JOBS_MODE is not "queue"; the API runs jobs inline and this worker has nothing to do');
}

const workers = (Object.keys(QUEUES) as QueueName[]).map((name) => {
  const worker = new Worker(
    name,
    async (job) => {
      const handler = getJobHandler(job.name);
      if (!handler) throw new Error(`no handler for job ${job.name}`);
      await handler(job.data);
    },
    { connection: createBullConnection(), concurrency: QUEUES[name].concurrency },
  );
  worker.on('failed', (job, err) =>
    logger.error(
      { queue: name, job: job?.name, id: job?.id, attempts: job?.attemptsMade, err: err.message },
      'job failed',
    ),
  );
  worker.on('error', (err) => logger.error({ queue: name, err: err.message }, 'worker error'));
  return worker;
});

async function schedule() {
  const maintenance = getQueue('maintenance');
  await maintenance.upsertJobScheduler(
    'refresh-analytics',
    { every: 15 * 60_000 },
    { name: 'refresh-analytics', data: {} },
  );
  await maintenance.upsertJobScheduler('sla-check', { every: 60 * 60_000 }, { name: 'sla-check', data: {} });
  await maintenance.upsertJobScheduler(
    'cleanup-uploads',
    { every: 6 * 60 * 60_000 },
    { name: 'cleanup-uploads', data: {} },
  );
}

schedule()
  .then(() => logger.info({ queues: Object.keys(QUEUES) }, 'worker started'))
  .catch((err) => logger.error({ err }, 'failed to register schedules'));

async function shutdown(signal: string) {
  logger.info({ signal }, 'worker shutting down');
  await Promise.all(workers.map((w) => w.close()));
  await closeQueues();
  await pool.end();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
