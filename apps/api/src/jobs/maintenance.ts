import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { OPEN_STATUSES } from '@urbanfix/shared';
import { logger } from '../core/logger';
import { redis } from '../core/redis';
import { storage } from '../core/storage';
import { db, schema } from '../db/client';
import { Effects } from '../lib/effects';
import { formatRef } from '../lib/format';
import { recomputePriority } from '../modules/issues/events';
import { notifyUsers, wardOfficialIds } from '../modules/notifications/service';

const { issues, photos } = schema;

export async function refreshAnalytics() {
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY daily_issue_stats`);
}

/** Notifies officials (once a day per issue) about open issues past their SLA and raises their priority. */
export async function slaCheck() {
  const overdue = await db
    .select()
    .from(issues)
    .where(
      and(
        inArray(issues.status, [...OPEN_STATUSES]),
        isNull(issues.mergedIntoId),
        isNotNull(issues.slaDueAt),
        lt(issues.slaDueAt, new Date()),
      ),
    )
    .limit(500);
  for (const issue of overdue) {
    const fresh = await redis.set(`uf:sla:${issue.id}`, '1', 'EX', 86_400, 'NX');
    if (!fresh) continue;
    const fx = new Effects();
    await db.transaction(async (tx) => {
      await recomputePriority(tx, issue.id);
      await notifyUsers(tx, fx, [issue.assigneeId, ...(await wardOfficialIds(tx, issue.wardId))], {
        type: 'SLA_OVERDUE',
        title: `Overdue: ${formatRef(issue.refNo)}`,
        body: `${issue.title} has passed its resolution target.`,
        issueId: issue.id,
      });
    });
    await fx.flush();
  }
  if (overdue.length) logger.info({ count: overdue.length }, 'sla check complete');
}

/** Deletes photos uploaded but never attached to a report (abandoned report flows). */
export async function cleanupDraftUploads() {
  const stale = await db
    .select()
    .from(photos)
    .where(and(eq(photos.status, 'DRAFT'), lt(photos.createdAt, new Date(Date.now() - 24 * 3_600_000))))
    .limit(500);
  for (const p of stale) {
    await Promise.all(Object.values(p.variants).map((key) => storage.delete(key).catch(() => undefined)));
    await db.delete(photos).where(eq(photos.id, p.id));
  }
  if (stale.length) logger.info({ count: stale.length }, 'removed abandoned uploads');
}
