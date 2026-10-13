import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  LABELS,
  OPEN_STATUSES,
  allowedTransitions,
  canTransition,
  type IssueStatus,
  type ManageIssueDetail,
  type ManageIssueRow,
  type ManageListQuery,
  type ManageStats,
  type PagedResult,
  type StaffMember,
  type StatusChangeInput,
} from '@urbanfix/shared';
import type { FastifyRequest } from 'fastify';
import type { AuthContext } from '../../core/auth';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { emitTo, rooms } from '../../core/realtime';
import { type Tx, db, schema } from '../../db/client';
import { audit } from '../../lib/audit';
import { categoryBySlug } from '../../lib/categories';
import { Effects } from '../../lib/effects';
import { formatRef, isoOrNow, iso } from '../../lib/format';
import { getSettings } from '../../lib/settings';
import { addEvent } from '../issues/events';
import {
  issueFilters,
  loadIssueDetail,
  reportsForIssue,
  summaryQuery,
  toIssueSummary,
  type SummaryRow,
} from '../issues/repo';
import { issueFollowerIds, issueReporterIds, notifyUsers } from '../notifications/service';
import { claimDraftUploads } from '../uploads/service';
import { forceVerify, openRound, reopenIssue } from '../verification/service';

const { issues, users, reports, photos, issueEvents, wards } = schema;
type IssueRow = typeof issues.$inferSelect;

/* ---------- scope & permissions ---------- */

/** Ward-scoped officials and staff only see their ward; admins and city-wide officials see everything. */
export function scopeWhere(auth: AuthContext): SQL | undefined {
  if (auth.role === 'ADMIN' || !auth.wardId) return undefined;
  return eq(issues.wardId, auth.wardId);
}

async function loadScopedIssue(tx: Tx, auth: AuthContext, issueId: string): Promise<IssueRow> {
  const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).for('update');
  if (!issue) throw notFound('Issue');
  if (auth.role !== 'ADMIN' && auth.wardId && issue.wardId !== auth.wardId) throw notFound('Issue');
  return issue;
}

/** Field staff may only work on issues assigned to them. */
function assertCanWork(auth: AuthContext, issue: IssueRow) {
  if (auth.role === 'STAFF' && issue.assigneeId !== auth.id) {
    throw forbidden('This issue is not assigned to you');
  }
}

const label = (i: IssueRow) => `${formatRef(i.refNo)} · ${i.title}`;

/* ---------- queries ---------- */

export async function listManagedIssues(
  auth: AuthContext,
  q: ManageListQuery,
): Promise<PagedResult<ManageIssueRow>> {
  const where = [...issueFilters(q)];
  const scope = scopeWhere(auth);
  if (scope) where.push(scope);
  if (q.assignee === 'me') where.push(eq(issues.assigneeId, auth.id));
  else if (q.assignee === 'unassigned') where.push(isNull(issues.assigneeId));
  else if (q.assignee) where.push(eq(issues.assigneeId, q.assignee));
  if (q.overdue) {
    where.push(sql`${issues.slaDueAt} < now()`, inArray(issues.status, [...OPEN_STATUSES]));
  }

  const orderBy: Record<ManageListQuery['sort'], SQL[]> = {
    newest: [desc(issues.createdAt)],
    oldest: [asc(issues.createdAt)],
    updated: [desc(issues.lastActivityAt)],
    priority: [
      sql`array_position(ARRAY['CRITICAL','HIGH','MEDIUM','LOW']::priority[], ${issues.priority})`,
      desc(issues.createdAt),
    ],
    support: [desc(issues.supportCount), desc(issues.createdAt)],
    sla: [sql`${issues.slaDueAt} ASC NULLS LAST`],
  };

  const flagged = sql<number>`(SELECT count(*)::int FROM reports r WHERE r.issue_id = ${issues.id} AND r.moderation_status = 'FLAGGED')`;
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    summaryQuery(db, {
      assigneeId: issues.assigneeId,
      assigneeName: sql<string | null>`(SELECT name FROM users u WHERE u.id = ${issues.assigneeId})`,
      slaDueAt: issues.slaDueAt,
      flagged,
    })
      .where(and(...where))
      .orderBy(...orderBy[q.sort], desc(issues.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize) as unknown as Promise<
      (SummaryRow & {
        assigneeId: string | null;
        assigneeName: string | null;
        slaDueAt: Date | null;
        flagged: number;
      })[]
    >,
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(issues)
      .innerJoin(schema.categories, eq(schema.categories.id, issues.categoryId))
      .where(and(...where)),
  ]);

  const now = Date.now();
  return {
    items: rows.map((r) => ({
      ...toIssueSummary(r),
      assignee: r.assigneeId ? { id: r.assigneeId, name: r.assigneeName ?? 'Unknown' } : null,
      slaDueAt: iso(r.slaDueAt),
      overdue: Boolean(r.slaDueAt && r.slaDueAt.getTime() < now && OPEN_STATUSES.includes(r.status!)),
      flagged: r.flagged > 0,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

export async function managedIssueDetail(auth: AuthContext, issueId: string): Promise<ManageIssueDetail> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  if (!issue) throw notFound('Issue');
  if (auth.role !== 'ADMIN' && auth.wardId && issue.wardId !== auth.wardId) throw notFound('Issue');

  const [detail, publicReports, reporterRows, overrides] = await Promise.all([
    loadIssueDetail(issueId, auth),
    reportsForIssue(issueId, auth),
    db
      .select({ id: reports.id, reporterId: reports.reporterId, email: users.email })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(eq(reports.issueId, issueId)),
    db
      .select({ id: reports.id, dismissed: reports.duplicateOverride })
      .from(reports)
      .where(and(eq(reports.issueId, issueId), sql`${reports.duplicateOverride} IS NOT NULL`)),
  ]);
  const byReport = new Map(reporterRows.map((r) => [r.id, r]));
  const canWork = auth.role !== 'STAFF' || issue.assigneeId === auth.id;
  return {
    ...detail,
    priorityLocked: issue.priorityLocked,
    reports: publicReports.map((r) => ({
      ...r,
      reporterId: byReport.get(r.id)?.reporterId ?? '',
      reporterEmail: byReport.get(r.id)?.email ?? null,
    })),
    allowedTransitions: canWork ? allowedTransitions(issue.status, auth.role) : [],
    flaggedReports: publicReports.filter((r) => r.moderationStatus === 'FLAGGED').length,
    duplicateOverrides: overrides.map((o) => ({ reportId: o.id, dismissed: o.dismissed ?? [] })),
  };
}

/* ---------- commands ---------- */

export async function assignIssue(
  auth: AuthContext,
  issueId: string,
  assigneeId: string | null,
  req: FastifyRequest,
) {
  const fx = new Effects();
  await db.transaction(async (tx) => {
    const issue = await loadScopedIssue(tx, auth, issueId);
    let assigneeName: string | null = null;
    if (assigneeId) {
      const [assignee] = await tx.select().from(users).where(eq(users.id, assigneeId));
      if (!assignee || !['STAFF', 'OFFICIAL'].includes(assignee.role) || assignee.status !== 'ACTIVE') {
        throw badRequest('Assign the issue to an active staff member or official');
      }
      if (assignee.wardId && issue.wardId && assignee.wardId !== issue.wardId) {
        throw badRequest('That staff member works in a different ward');
      }
      assigneeName = assignee.name;
    }
    if (issue.assigneeId === assigneeId) return;
    await tx.update(issues).set({ assigneeId }).where(eq(issues.id, issueId));
    await addEvent(tx, {
      issueId,
      actorId: auth.id,
      type: 'ASSIGNED',
      payload: { assigneeId, assigneeName, previousAssigneeId: issue.assigneeId },
    });
    await audit(tx, req, {
      action: 'issue.assign',
      entityType: 'issue',
      entityId: issueId,
      diff: { assigneeId },
    });
    if (assigneeId) {
      await notifyUsers(
        tx,
        fx,
        [assigneeId],
        {
          type: 'ISSUE_ASSIGNED',
          title: 'New assignment',
          body: `You were assigned ${label(issue)}.`,
          issueId,
        },
        [auth.id],
      );
      await notifyUsers(tx, fx, await issueReporterIds(tx, issueId), {
        type: 'ISSUE_ASSIGNED',
        title: 'A team is on it',
        body: `${label(issue)} was assigned to municipal field staff.`,
        issueId,
      });
    }
  });
  await fx.flush();
  emitTo([rooms.issue(issueId), rooms.officials], 'issue:updated', { id: issueId });
  return managedIssueDetail(auth, issueId);
}

export async function changeStatus(
  auth: AuthContext,
  issueId: string,
  input: StatusChangeInput,
  req: FastifyRequest,
) {
  const fx = new Effects();
  await db.transaction(async (tx) => {
    const issue = await loadScopedIssue(tx, auth, issueId);
    assertCanWork(auth, issue);
    const from = issue.status;
    const to = input.status;
    if (from === to) return;
    if (!canTransition(from, to, auth.role)) {
      throw new AppError(
        422,
        'INVALID_TRANSITION',
        `Cannot move an issue from ${LABELS.status[from]} to ${LABELS.status[to]}`,
      );
    }
    if (to === 'REJECTED' && !input.note) throw badRequest('Give a reason for rejecting this issue');

    await audit(tx, req, {
      action: 'issue.status',
      entityType: 'issue',
      entityId: issueId,
      diff: { from, to },
    });

    if (to === 'REOPENED') {
      await reopenIssue(tx, fx, issue, { actorId: auth.id, by: 'official', comment: input.note });
      return;
    }
    if (to === 'VERIFIED') {
      await forceVerify(tx, fx, issue, auth.id);
      return;
    }

    if (to === 'RESOLVED') {
      const settings = await getSettings();
      if (settings.requireCompletionPhoto) {
        const [{ count } = { count: 0 }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(photos)
          .where(
            and(eq(photos.issueId, issueId), eq(photos.kind, 'WORK_COMPLETION'), ne(photos.status, 'HIDDEN')),
          );
        if (!count)
          throw badRequest('Upload at least one work-completion photo before marking this resolved');
      }
    }

    await tx
      .update(issues)
      .set({
        status: to,
        resolvedAt:
          to === 'RESOLVED' ? new Date() : to === 'PENDING' || to === 'IN_PROGRESS' ? null : issue.resolvedAt,
        assigneeId:
          to === 'IN_PROGRESS' && !issue.assigneeId && auth.role !== 'ADMIN' ? auth.id : issue.assigneeId,
      })
      .where(eq(issues.id, issueId));
    await addEvent(tx, {
      issueId,
      actorId: auth.id,
      type: 'STATUS_CHANGED',
      fromStatus: from,
      toStatus: to,
      body: input.note,
    });

    if (to === 'RESOLVED') {
      await openRound(tx, fx, { ...issue, status: to }, auth.id);
      const reporters = new Set(await issueReporterIds(tx, issueId));
      const supporters = (await issueFollowerIds(tx, issueId)).filter((id) => !reporters.has(id));
      await notifyUsers(tx, fx, supporters, {
        type: 'ISSUE_RESOLVED',
        title: 'Marked resolved',
        body: `${label(issue)} was marked resolved by the municipal corporation.`,
        issueId,
      });
    } else {
      if (to === 'REJECTED') {
        await tx
          .update(schema.verificationRounds)
          .set({ outcome: 'EXPIRED', closedAt: new Date() })
          .where(
            and(
              eq(schema.verificationRounds.issueId, issueId),
              eq(schema.verificationRounds.outcome, 'PENDING'),
            ),
          );
      }
      await notifyUsers(
        tx,
        fx,
        await issueFollowerIds(tx, issueId),
        {
          type: 'ISSUE_STATUS_CHANGED',
          title: `Status: ${LABELS.status[to]}`,
          body: input.note
            ? `${label(issue)} — ${input.note}`
            : `${label(issue)} is now ${LABELS.status[to].toLowerCase()}.`,
          issueId,
          data: { status: to },
        },
        [auth.id],
      );
    }
  });
  await fx.flush();
  const [row] = await db.select({ status: issues.status }).from(issues).where(eq(issues.id, issueId));
  emitTo([rooms.issue(issueId), rooms.officials, rooms.publicMap], 'issue:updated', {
    id: issueId,
    status: row?.status as IssueStatus,
  });
  return managedIssueDetail(auth, issueId);
}

export async function patchIssue(
  auth: AuthContext,
  issueId: string,
  input: { priority?: IssueRow['priority']; priorityLocked?: boolean; categorySlug?: string },
  req: FastifyRequest,
) {
  await db.transaction(async (tx) => {
    const issue = await loadScopedIssue(tx, auth, issueId);
    const updates: Partial<typeof issues.$inferInsert> = {};
    if (input.priority && input.priority !== issue.priority) {
      updates.priority = input.priority;
      updates.priorityLocked = input.priorityLocked ?? true;
      await addEvent(tx, {
        issueId,
        actorId: auth.id,
        type: 'PRIORITY_CHANGED',
        payload: { from: issue.priority, to: input.priority, automatic: false },
      });
    } else if (input.priorityLocked !== undefined) {
      updates.priorityLocked = input.priorityLocked;
    }
    if (input.categorySlug) {
      const category = await categoryBySlug(input.categorySlug);
      if (!category) throw badRequest('Unknown category');
      if (category.id !== issue.categoryId) {
        updates.categoryId = category.id;
        await addEvent(tx, {
          issueId,
          actorId: auth.id,
          type: 'CATEGORY_CHANGED',
          payload: { to: category.slug, toName: category.name },
        });
      }
    }
    if (Object.keys(updates).length) {
      await tx.update(issues).set(updates).where(eq(issues.id, issueId));
      await audit(tx, req, { action: 'issue.update', entityType: 'issue', entityId: issueId, diff: input });
    }
  });
  emitTo([rooms.issue(issueId), rooms.officials], 'issue:updated', { id: issueId, priority: input.priority });
  return managedIssueDetail(auth, issueId);
}

export async function addNote(auth: AuthContext, issueId: string, body: string) {
  await db.transaction(async (tx) => {
    await loadScopedIssue(tx, auth, issueId);
    await addEvent(tx, { issueId, actorId: auth.id, type: 'NOTE_ADDED', body, isInternal: true });
  });
  return listNotes(auth, issueId);
}

export async function listNotes(auth: AuthContext, issueId: string) {
  const rows = await db
    .select({ e: issueEvents, name: users.name, role: users.role })
    .from(issueEvents)
    .leftJoin(users, eq(users.id, issueEvents.actorId))
    .innerJoin(issues, eq(issues.id, issueEvents.issueId))
    .where(and(eq(issueEvents.issueId, issueId), eq(issueEvents.type, 'NOTE_ADDED'), scopeWhere(auth)))
    .orderBy(desc(issueEvents.createdAt));
  return rows.map(({ e, name, role }) => ({
    id: e.id,
    body: e.body ?? '',
    author: name ? { name, role } : null,
    createdAt: isoOrNow(e.createdAt),
  }));
}

export async function addWorkPhotos(auth: AuthContext, issueId: string, uploadIds: string[], note?: string) {
  await db.transaction(async (tx) => {
    const issue = await loadScopedIssue(tx, auth, issueId);
    assertCanWork(auth, issue);
    const uploads = await claimDraftUploads(tx, auth.id, uploadIds, 'WORK_COMPLETION');
    for (const u of uploads) {
      await tx.update(photos).set({ status: 'ATTACHED', issueId }).where(eq(photos.id, u.id));
    }
    await addEvent(tx, {
      issueId,
      actorId: auth.id,
      type: 'WORK_PHOTOS_ADDED',
      body: note ?? null,
      payload: { photoIds: uploads.map((u) => u.id), count: uploads.length },
    });
  });
  emitTo(rooms.issue(issueId), 'issue:updated', { id: issueId });
  return managedIssueDetail(auth, issueId);
}

/**
 * Merges a duplicate into a target issue: reports, photos and supporters move
 * to the target; the source is closed as a duplicate and points to the target.
 */
export async function mergeIssues(
  auth: AuthContext,
  sourceId: string,
  targetId: string,
  req: FastifyRequest,
) {
  if (sourceId === targetId) throw badRequest('Choose a different issue to merge into');
  const fx = new Effects();
  await db.transaction(async (tx) => {
    const source = await loadScopedIssue(tx, auth, sourceId);
    const target = await loadScopedIssue(tx, auth, targetId);
    if (source.mergedIntoId) throw conflict('ALREADY_MERGED', 'This issue was already merged');
    if (target.mergedIntoId || target.status === 'REJECTED') {
      throw conflict('INVALID_TARGET', 'The target issue is closed or merged');
    }

    const sourceReports = await tx.select().from(reports).where(eq(reports.issueId, sourceId));
    const targetReports = await tx.select().from(reports).where(eq(reports.issueId, targetId));
    const targetByReporter = new Map(targetReports.map((r) => [r.reporterId, r.id]));
    for (const r of sourceReports) {
      const existing = targetByReporter.get(r.reporterId);
      if (existing) {
        await tx
          .update(photos)
          .set({ issueId: targetId, reportId: existing })
          .where(eq(photos.reportId, r.id));
      } else {
        await tx.update(reports).set({ issueId: targetId, source: 'MERGED' }).where(eq(reports.id, r.id));
        await tx.update(photos).set({ issueId: targetId }).where(eq(photos.reportId, r.id));
      }
    }
    await tx.execute(sql`
      INSERT INTO issue_supporters (issue_id, user_id, is_reporter, created_at)
      SELECT ${targetId}, user_id, is_reporter, created_at FROM issue_supporters WHERE issue_id = ${sourceId}
      ON CONFLICT (issue_id, user_id) DO UPDATE SET is_reporter = issue_supporters.is_reporter OR EXCLUDED.is_reporter`);
    await tx.execute(sql`
      UPDATE issues SET
        support_count = (SELECT count(*) FROM issue_supporters WHERE issue_id = ${targetId}),
        reporter_count = (SELECT count(*) FROM issue_supporters WHERE issue_id = ${targetId} AND is_reporter),
        report_count = (SELECT count(*) FROM reports WHERE issue_id = ${targetId}),
        last_activity_at = now()
      WHERE id = ${targetId}`);
    await tx
      .update(issues)
      .set({ status: 'REJECTED', mergedIntoId: targetId })
      .where(eq(issues.id, sourceId));
    await tx
      .update(schema.verificationRounds)
      .set({ outcome: 'EXPIRED', closedAt: new Date() })
      .where(
        and(
          eq(schema.verificationRounds.issueId, sourceId),
          eq(schema.verificationRounds.outcome, 'PENDING'),
        ),
      );

    await addEvent(tx, {
      issueId: sourceId,
      actorId: auth.id,
      type: 'MERGED',
      fromStatus: source.status,
      toStatus: 'REJECTED',
      body: `Merged into ${formatRef(target.refNo)} as a duplicate`,
      payload: { targetId, targetRef: formatRef(target.refNo) },
    });
    await addEvent(tx, {
      issueId: targetId,
      actorId: auth.id,
      type: 'MERGED',
      body: `${formatRef(source.refNo)} was merged into this issue`,
      payload: { sourceId, sourceRef: formatRef(source.refNo), movedReports: sourceReports.length },
    });
    await audit(tx, req, {
      action: 'issue.merge',
      entityType: 'issue',
      entityId: sourceId,
      diff: { targetId },
    });
    await notifyUsers(
      tx,
      fx,
      await issueFollowerIds(tx, targetId),
      {
        type: 'ISSUE_STATUS_CHANGED',
        title: 'Reports combined',
        body: `${label(source)} was merged into ${label(target)}. Updates will continue there.`,
        issueId: targetId,
        data: { mergedFrom: sourceId },
      },
      [auth.id],
    );
  });
  await fx.flush();
  emitTo([rooms.issue(sourceId), rooms.issue(targetId), rooms.officials], 'issue:updated', { id: targetId });
  return managedIssueDetail(auth, targetId);
}

/* ---------- staff & stats ---------- */

export async function listStaff(auth: AuthContext, wardId?: string): Promise<StaffMember[]> {
  const ward = wardId ?? (auth.role === 'ADMIN' ? undefined : (auth.wardId ?? undefined));
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      wardId: users.wardId,
      wardName: wards.name,
      open: sql<number>`(SELECT count(*)::int FROM issues i WHERE i.assignee_id = ${users.id}
                         AND i.status IN ('PENDING','IN_PROGRESS','REOPENED'))`,
    })
    .from(users)
    .leftJoin(wards, eq(wards.id, users.wardId))
    .where(
      and(
        inArray(users.role, ['STAFF', 'OFFICIAL']),
        eq(users.status, 'ACTIVE'),
        ward ? or(eq(users.wardId, ward), isNull(users.wardId)) : undefined,
      ),
    )
    .orderBy(asc(users.role), asc(users.name));
  return rows.map((r) => ({ ...r, openAssignments: r.open }));
}

export async function manageStats(auth: AuthContext): Promise<ManageStats> {
  const scope = auth.role !== 'ADMIN' && auth.wardId ? sql`AND ward_id = ${auth.wardId}` : sql``;
  const res = await db.execute<{
    status: IssueStatus;
    count: number;
  }>(
    sql`SELECT status, count(*)::int AS count FROM issues WHERE merged_into_id IS NULL ${scope} GROUP BY status`,
  );
  const byStatus = {
    PENDING: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    VERIFIED: 0,
    REOPENED: 0,
    REJECTED: 0,
  } as Record<IssueStatus, number>;
  for (const r of res.rows) byStatus[r.status] = r.count;

  const k = await db.execute<{
    unassigned: number;
    overdue: number;
    resolved_week: number;
    avg_hours: number | null;
    reopen_rate: number | null;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE assignee_id IS NULL AND status IN ('PENDING','IN_PROGRESS','REOPENED'))::int AS unassigned,
      count(*) FILTER (WHERE sla_due_at < now() AND status IN ('PENDING','IN_PROGRESS','REOPENED'))::int AS overdue,
      count(*) FILTER (WHERE resolved_at >= now() - interval '7 days')::int AS resolved_week,
      avg(extract(epoch FROM resolved_at - created_at) / 3600) FILTER (WHERE resolved_at IS NOT NULL) AS avg_hours,
      (count(*) FILTER (WHERE reopened_count > 0))::float / nullif(count(*) FILTER (WHERE status IN ('RESOLVED','VERIFIED','REOPENED')), 0) AS reopen_rate
    FROM issues WHERE merged_into_id IS NULL ${scope}`);
  const s = k.rows[0]!;
  return {
    open: byStatus.PENDING + byStatus.IN_PROGRESS + byStatus.REOPENED,
    unassigned: s.unassigned,
    overdue: s.overdue,
    resolvedThisWeek: s.resolved_week,
    avgResolutionHours: s.avg_hours == null ? null : Math.round(Number(s.avg_hours) * 10) / 10,
    reopenRate: Math.round(Number(s.reopen_rate ?? 0) * 1000) / 1000,
    byStatus,
  };
}
