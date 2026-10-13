import { enqueue, type EnqueueOptions, type JobName, type JobPayloads } from '../core/jobs';
import { logger } from '../core/logger';

/**
 * Side effects that must only happen after a transaction commits: queueing
 * notification delivery, realtime broadcasts and follow-up jobs. Services add
 * to an `Effects` while inside a transaction; the caller flushes it afterwards.
 */
export class Effects {
  private notificationIds: string[] = [];
  private broadcasts: (() => void)[] = [];
  private jobs: { name: JobName; data: unknown; opts?: EnqueueOptions }[] = [];

  addNotifications(ids: string[]) {
    this.notificationIds.push(...ids);
  }

  broadcast(fn: () => void) {
    this.broadcasts.push(fn);
  }

  job<N extends JobName>(name: N, data: JobPayloads[N], opts?: EnqueueOptions) {
    this.jobs.push({ name, data, opts });
  }

  async flush() {
    try {
      if (this.notificationIds.length) await enqueue('notify', { notificationIds: this.notificationIds });
      for (const j of this.jobs) await enqueue(j.name, j.data as never, j.opts);
      for (const b of this.broadcasts) b();
    } catch (err) {
      // The transaction already committed; a failed side effect must not fail the request.
      logger.error({ err }, 'failed to flush post-commit effects');
    }
  }
}
