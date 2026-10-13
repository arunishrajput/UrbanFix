import { eq, sql } from 'drizzle-orm';
import { computePriority, type IssueEventType, type IssueStatus } from '@urbanfix/shared';
import { type DbOrTx, schema } from '../../db/client';
import { categoryById } from '../../lib/categories';

const { issueEvents, issues } = schema;

export interface EventInput {
  issueId: string;
  actorId: string | null;
  type: IssueEventType;
  fromStatus?: IssueStatus | null;
  toStatus?: IssueStatus | null;
  body?: string | null;
  payload?: Record<string, unknown>;
  isInternal?: boolean;
}

/** Appends to the issue timeline and bumps `last_activity_at`. */
export async function addEvent(dbx: DbOrTx, e: EventInput) {
  await dbx.insert(issueEvents).values({
    issueId: e.issueId,
    actorId: e.actorId,
    type: e.type,
    fromStatus: e.fromStatus ?? null,
    toStatus: e.toStatus ?? null,
    body: e.body ?? null,
    payload: e.payload ?? {},
    isInternal: e.isInternal ?? false,
  });
  if (!e.isInternal) {
    await dbx.update(issues).set({ lastActivityAt: new Date() }).where(eq(issues.id, e.issueId));
  }
}

/**
 * Recomputes the suggested priority from category, AI severity, support,
 * reopen count and SLA. Locked priorities (set by an official) are left alone.
 */
export async function recomputePriority(dbx: DbOrTx, issueId: string) {
  const [issue] = await dbx.select().from(issues).where(eq(issues.id, issueId)).for('update');
  if (!issue || issue.priorityLocked) return issue?.priority ?? null;
  const category = await categoryById(issue.categoryId);
  const { priority } = computePriority({
    categoryDefault: category?.defaultPriority ?? 'MEDIUM',
    severity: issue.severity,
    supportCount: issue.supportCount,
    reopenedCount: issue.reopenedCount,
    slaBreached: Boolean(issue.slaDueAt && issue.slaDueAt < new Date() && !issue.resolvedAt),
  });
  if (priority !== issue.priority) {
    await dbx
      .update(issues)
      .set({ priority, updatedAt: sql`now()` })
      .where(eq(issues.id, issueId));
    await addEvent(dbx, {
      issueId,
      actorId: null,
      type: 'PRIORITY_CHANGED',
      payload: { from: issue.priority, to: priority, automatic: true },
    });
  }
  return priority;
}
