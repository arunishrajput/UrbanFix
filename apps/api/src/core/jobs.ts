/**
 * Background jobs. In `queue` mode jobs go to BullMQ and run in the worker
 * process (src/worker.ts); in `inline` mode (tests, single-process setups) they
 * run in this process right after the current request.
 */
import { Queue, type JobsOptions } from 'bullmq';
import { config } from '../config';
import { logger } from './logger';
import { createBullConnection } from './redis';

export interface JobPayloads {
  'analyze-photo': { photoId: string };
  notify: { notificationIds: string[] };
  'close-verification': { roundId: string };
  'award-badges': { userId: string };
  'refresh-analytics': Record<string, never>;
  'sla-check': Record<string, never>;
  'cleanup-uploads': Record<string, never>;
}
export type JobName = keyof JobPayloads;

/** Each queue gets its own worker concurrency (AI is rate limited on the free tier). */
export const QUEUES = {
  ai: { concurrency: 2 },
  notifications: { concurrency: 10 },
  workflow: { concurrency: 5 },
  maintenance: { concurrency: 1 },
} as const;
export type QueueName = keyof typeof QUEUES;

export const JOB_QUEUE: Record<JobName, QueueName> = {
  'analyze-photo': 'ai',
  notify: 'notifications',
  'close-verification': 'workflow',
  'award-badges': 'workflow',
  'refresh-analytics': 'maintenance',
  'sla-check': 'maintenance',
  'cleanup-uploads': 'maintenance',
};

type Handler<N extends JobName> = (data: JobPayloads[N]) => Promise<void>;
const handlers = new Map<JobName, Handler<JobName>>();

export function registerJob<N extends JobName>(name: N, handler: Handler<N>) {
  handlers.set(name, handler as Handler<JobName>);
}

export function getJobHandler(name: string): Handler<JobName> | undefined {
  return handlers.get(name as JobName);
}

const queues = new Map<QueueName, Queue>();
function queue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 1000, age: 24 * 3600 },
        removeOnFail: { count: 5000 },
      },
    });
    queues.set(name, q);
  }
  return q;
}

const inlinePending = new Set<Promise<void>>();
/** Node timers overflow past ~24.8 days and would fire immediately. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export interface EnqueueOptions {
  delayMs?: number;
  /** Deduplicates: a job with the same id is only added once. */
  jobId?: string;
}

export async function enqueue<N extends JobName>(name: N, data: JobPayloads[N], opts: EnqueueOptions = {}) {
  if (config.JOBS_MODE === 'inline') {
    const handler = handlers.get(name);
    if (!handler) return;
    if (opts.delayMs) {
      // Delayed work (e.g. closing a verification window in 72 h) runs on a timer that never
      // keeps the process alive. Inline mode is for tests and single-process setups; use the
      // queue in production so delayed jobs survive restarts.
      setTimeout(
        () => {
          handler(data).catch((err) => logger.error({ err, job: name }, 'delayed inline job failed'));
        },
        Math.min(opts.delayMs, MAX_TIMER_MS),
      ).unref();
      return;
    }
    const p = handler(data)
      .catch((err) => logger.error({ err, job: name }, 'inline job failed'))
      .finally(() => inlinePending.delete(p));
    inlinePending.add(p);
    return;
  }
  const jobOpts: JobsOptions = {};
  if (opts.delayMs) jobOpts.delay = opts.delayMs;
  if (opts.jobId) jobOpts.jobId = opts.jobId;
  await queue(JOB_QUEUE[name]).add(name, data, jobOpts);
}

/** Test helper: wait for inline jobs (including jobs they enqueue) to finish. */
export async function drainInlineJobs() {
  while (inlinePending.size) await Promise.all([...inlinePending]);
}

export function getQueue(name: QueueName) {
  return queue(name);
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
