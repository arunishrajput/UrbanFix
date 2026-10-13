/**
 * Recurring maintenance. In queue mode the worker registers these as BullMQ job
 * schedulers; in inline mode (single-service deploys) the API runs them on timers.
 */
import { enqueue, type JobName } from '../core/jobs';

const MINUTE = 60_000;

export const MAINTENANCE_SCHEDULE = [
  { name: 'refresh-analytics', everyMs: 15 * MINUTE },
  { name: 'close-expired-verifications', everyMs: 15 * MINUTE },
  { name: 'sla-check', everyMs: 60 * MINUTE },
  { name: 'cleanup-uploads', everyMs: 6 * 60 * MINUTE },
] as const satisfies readonly { name: JobName; everyMs: number }[];

/** Delay before the first run after boot, so startup (and migrations) settle first. */
const BOOT_DELAY_MS = 20_000;

let lastActivityAt = 0;

/** Called for every API request; the inline scheduler skips runs while the app is idle. */
export function markActivity() {
  lastActivityAt = Date.now();
}

/**
 * Inline mode: runs each job once shortly after boot, then on its interval, but
 * only if the API has served requests since that job last ran. An idle deploy
 * therefore lets a scale-to-zero database (e.g. Neon) suspend. Timers never keep
 * the process alive.
 */
export function startInlineScheduler() {
  for (const { name, everyMs } of MAINTENANCE_SCHEDULE) {
    let lastRunAt = 0;
    const run = () => {
      if (lastRunAt && lastActivityAt < lastRunAt) return;
      lastRunAt = Date.now();
      void enqueue(name, {});
    };
    setTimeout(run, BOOT_DELAY_MS).unref();
    setInterval(run, everyMs).unref();
  }
}
