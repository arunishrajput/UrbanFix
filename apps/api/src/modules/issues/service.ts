import { and, eq, sql } from 'drizzle-orm';
import {
  DUPLICATE_CANDIDATE_STATUSES,
  computePriority,
  haversineM,
  type CreateIssueInput,
  type CreateIssueResult,
  type JoinIssueInput,
  type JoinIssueResult,
  type PhotoAnalysis,
} from '@urbanfix/shared';
import type { AuthContext } from '../../core/auth';
import { AppError, badRequest, conflict, notFound } from '../../core/errors';
import { emitTo, rooms } from '../../core/realtime';
import { type Tx, db, schema } from '../../db/client';
import { categoryBySlug } from '../../lib/categories';
import { Effects } from '../../lib/effects';
import { formatRef } from '../../lib/format';
import { fallbackTitle } from '../ai/heuristics';
import { checkDuplicates } from '../duplicates/service';
import { awardReputation } from '../gamification/service';
import { findWardId, reverseGeocode } from '../geo/service';
import { notifyUsers, wardOfficialIds } from '../notifications/service';
import { claimDraftUploads } from '../uploads/service';
import { reopenIssue } from '../verification/service';
import { addEvent, recomputePriority } from './events';
import { loadIssueDetail } from './repo';

const { issues, reports, photos, issueSupporters } = schema;
type PhotoRow = typeof photos.$inferSelect;

/** A citizen may join an issue only from roughly the same place. */
const MAX_JOIN_DISTANCE_M = 500;

/** Moderation outcome for a report from its photos' AI analyses. */
function moderationFor(photoRows: PhotoRow[]) {
  const analyses = photoRows.map((p) => p.analysis);
  const unsafe = photoRows.filter((p) => p.analysis && !p.analysis.moderation.safe);
  if (unsafe.length) return { status: 'FLAGGED' as const, hide: new Set(unsafe.map((p) => p.id)) };
  const allScreened = analyses.every((a) => a?.source === 'gemini');
  return { status: allScreened ? ('APPROVED' as const) : ('PENDING' as const), hide: new Set<string>() };
}

function bestAnalysis(photoRows: PhotoRow[]): PhotoAnalysis | null {
  return (
    photoRows
      .map((p) => p.analysis)
      .filter((a): a is PhotoAnalysis => Boolean(a))
      .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))[0] ?? null
  );
}

async function attachPhotos(tx: Tx, rows: PhotoRow[], issueId: string, reportId: string, hide: Set<string>) {
  for (const p of rows) {
    await tx
      .update(photos)
      .set({ issueId, reportId, status: hide.has(p.id) ? 'HIDDEN' : 'ATTACHED' })
      .where(eq(photos.id, p.id));
  }
}

export async function createIssue(auth: AuthContext, input: CreateIssueInput): Promise<CreateIssueResult> {
  const category = await categoryBySlug(input.categorySlug);
  if (!category || !category.isActive) throw badRequest('Choose a valid category');

  const uploads = await claimDraftUploads(db, auth.id, input.uploadIds, 'REPORT');

  // Server-side duplicate gate: the UI shows these first, but the API enforces it too.
  const dup = await checkDuplicates({
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM,
    categorySlug: category.slug,
    description: input.description,
    photos: uploads,
    userId: auth.id,
    dismissedIds: input.dismissedCandidateIds,
  });
  if (dup.ownRecentIssueId) {
    throw conflict('ALREADY_REPORTED', 'You already reported this issue nearby', dup);
  }
  if (dup.blocking) {
    throw conflict('DUPLICATE_SUSPECTED', dup.headline ?? 'A similar issue already exists nearby', dup);
  }

  const geocoded = input.address ? null : await reverseGeocode(input.lat, input.lng);
  const address = input.address ?? geocoded?.address ?? null;
  const analysis = bestAnalysis(uploads);
  const moderation = moderationFor(uploads);
  const { priority } = computePriority({
    categoryDefault: category.defaultPriority,
    severity: analysis?.severity,
    supportCount: 1,
    reopenedCount: 0,
  });
  const dismissedScores = dup.candidates
    .filter((c) => input.dismissedCandidateIds.includes(c.issue.id))
    .map((c) => ({ issueId: c.issue.id, score: c.score }));

  const fx = new Effects();
  const issueId = await db.transaction(async (tx) => {
    const wardId = await findWardId(tx, input.lat, input.lng);
    const [issue] = await tx
      .insert(issues)
      .values({
        categoryId: category.id,
        wardId,
        priority,
        severity: analysis?.severity ?? null,
        title: analysis?.caption ?? fallbackTitle(category.name, address),
        description: input.description ?? null,
        lat: input.lat,
        lng: input.lng,
        address,
        addressComponents: geocoded?.components ?? null,
        supportCount: 1,
        reportCount: 1,
        reporterCount: 1,
        createdById: auth.id,
        slaDueAt: new Date(Date.now() + category.slaHours * 3_600_000),
      })
      .returning();
    const [report] = await tx
      .insert(reports)
      .values({
        issueId: issue!.id,
        reporterId: auth.id,
        source: 'NEW',
        description: input.description ?? null,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM ?? null,
        address,
        ai: analysis,
        moderationStatus: moderation.status,
        duplicateOverride: dismissedScores.length ? dismissedScores : null,
      })
      .returning();
    await attachPhotos(tx, uploads, issue!.id, report!.id, moderation.hide);
    const cover = uploads.find((u) => !moderation.hide.has(u.id));
    if (cover) await tx.update(issues).set({ coverPhotoId: cover.id }).where(eq(issues.id, issue!.id));
    await tx.insert(issueSupporters).values({ issueId: issue!.id, userId: auth.id, isReporter: true });

    await addEvent(tx, {
      issueId: issue!.id,
      actorId: auth.id,
      type: 'CREATED',
      toStatus: 'PENDING',
      payload: {
        photoCount: uploads.length,
        dismissedDuplicates: dismissedScores.length,
        aiCategory: analysis?.categorySlug ?? null,
      },
    });
    const ref = formatRef(issue!.refNo);
    await notifyUsers(tx, fx, [auth.id], {
      type: 'ISSUE_SUBMITTED',
      title: `Report received · ${ref}`,
      body: `Thanks! Your ${category.name.toLowerCase()} report has been sent to the municipal corporation.`,
      issueId: issue!.id,
    });
    await notifyUsers(
      tx,
      fx,
      await wardOfficialIds(tx, wardId),
      {
        type: 'ISSUE_NEW_IN_WARD',
        title: `New ${category.name} issue · ${ref}`,
        body: address ? `Reported at ${address}` : 'A citizen reported a new issue.',
        issueId: issue!.id,
        data: { priority },
      },
      [auth.id],
    );
    await awardReputation(tx, fx, auth.id, 'REPORT_CREATED', report!.id);

    fx.broadcast(() => {
      const point = {
        id: issue!.id,
        lat: input.lat,
        lng: input.lng,
        status: 'PENDING' as const,
        priority,
        category: category.slug,
        supportCount: 1,
        title: issue!.title,
        wardId,
      };
      emitTo([rooms.publicMap, rooms.officials], 'issue:created', point);
    });
    return issue!.id;
  });
  await fx.flush();
  return { issue: await loadIssueDetail(issueId, auth) };
}

export async function joinIssue(
  auth: AuthContext,
  issueId: string,
  input: JoinIssueInput,
): Promise<JoinIssueResult> {
  const fx = new Effects();
  const { targetId, reopened } = await db.transaction(async (tx) => {
    let [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).for('update');
    if (!issue) throw notFound('Issue');
    if (issue.mergedIntoId) {
      [issue] = await tx.select().from(issues).where(eq(issues.id, issue.mergedIntoId)).for('update');
      if (!issue) throw notFound('Issue');
    }
    if (!DUPLICATE_CANDIDATE_STATUSES.includes(issue.status)) {
      throw conflict('ISSUE_CLOSED', 'This issue is closed. Please report it as a new issue.');
    }
    if (haversineM(issue, input) > MAX_JOIN_DISTANCE_M) {
      throw badRequest('You need to be near the issue to add evidence to it');
    }
    const [existing] = await tx
      .select()
      .from(issueSupporters)
      .where(and(eq(issueSupporters.issueId, issue.id), eq(issueSupporters.userId, auth.id)));
    if (existing?.isReporter) throw conflict('ALREADY_REPORTED', 'You have already reported this issue');

    const uploads = await claimDraftUploads(tx, auth.id, input.uploadIds, 'REPORT');
    const moderation = moderationFor(uploads);
    const analysis = bestAnalysis(uploads);
    const [report] = await tx
      .insert(reports)
      .values({
        issueId: issue.id,
        reporterId: auth.id,
        source: 'JOINED',
        description: input.description ?? null,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM ?? null,
        ai: analysis,
        moderationStatus: moderation.status,
      })
      .returning();
    await attachPhotos(tx, uploads, issue.id, report!.id, moderation.hide);

    if (existing) {
      await tx
        .update(issueSupporters)
        .set({ isReporter: true })
        .where(and(eq(issueSupporters.issueId, issue.id), eq(issueSupporters.userId, auth.id)));
    } else {
      await tx.insert(issueSupporters).values({ issueId: issue.id, userId: auth.id, isReporter: true });
    }
    const [updated] = await tx
      .update(issues)
      .set({
        reportCount: sql`${issues.reportCount} + 1`,
        reporterCount: sql`${issues.reporterCount} + 1`,
        supportCount: existing ? issues.supportCount : sql`${issues.supportCount} + 1`,
        severity: analysis?.severity
          ? sql`greatest(coalesce(${issues.severity}, 0), ${analysis.severity})`
          : issues.severity,
        coverPhotoId: issue.coverPhotoId ?? uploads.find((u) => !moderation.hide.has(u.id))?.id ?? null,
      })
      .where(eq(issues.id, issue.id))
      .returning();

    await addEvent(tx, {
      issueId: issue.id,
      actorId: auth.id,
      type: 'REPORT_JOINED',
      body: input.description ?? null,
      payload: { reportId: report!.id, photoCount: uploads.length, reporterCount: updated!.reporterCount },
    });
    await awardReputation(tx, fx, auth.id, 'REPORT_JOINED', report!.id);

    let reopened = false;
    if (issue.status === 'RESOLVED') {
      // A fresh report of a "resolved" problem is the strongest "still not fixed" signal there is.
      await reopenIssue(tx, fx, issue, {
        actorId: auth.id,
        by: 'citizen',
        comment: input.description ?? 'New report submitted after the issue was marked resolved.',
      });
      reopened = true;
    } else {
      const label = `${formatRef(issue.refNo)} · ${issue.title}`;
      await notifyUsers(
        tx,
        fx,
        [issue.assigneeId, ...(await wardOfficialIds(tx, issue.wardId))],
        {
          type: 'REPORT_JOINED',
          title: `${updated!.reporterCount} citizens now report this`,
          body: `New evidence was added to ${label}.`,
          issueId: issue.id,
        },
        [auth.id],
      );
    }
    await recomputePriority(tx, issue.id);

    fx.broadcast(() =>
      emitTo([rooms.issue(issue.id), rooms.publicMap, rooms.officials], 'issue:updated', {
        id: issue.id,
        supportCount: updated!.supportCount,
        ...(reopened ? { status: 'REOPENED' as const } : {}),
      }),
    );
    return { targetId: issue.id, reopened };
  });
  await fx.flush();
  return { issue: await loadIssueDetail(targetId, auth), reopened };
}

export async function setSupport(auth: AuthContext, issueId: string, support: boolean) {
  const result = await db.transaction(async (tx) => {
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).for('update');
    if (!issue) throw notFound('Issue');
    if (support) {
      if (issue.status === 'REJECTED' || issue.mergedIntoId) {
        throw new AppError(409, 'ISSUE_CLOSED', 'This issue can no longer be supported');
      }
      const inserted = await tx
        .insert(issueSupporters)
        .values({ issueId, userId: auth.id })
        .onConflictDoNothing()
        .returning();
      if (inserted.length) {
        await tx
          .update(issues)
          .set({ supportCount: sql`${issues.supportCount} + 1` })
          .where(eq(issues.id, issueId));
      }
    } else {
      const removed = await tx
        .delete(issueSupporters)
        .where(
          and(
            eq(issueSupporters.issueId, issueId),
            eq(issueSupporters.userId, auth.id),
            eq(issueSupporters.isReporter, false),
          ),
        )
        .returning();
      if (removed.length) {
        await tx
          .update(issues)
          .set({ supportCount: sql`greatest(1, ${issues.supportCount} - 1)` })
          .where(eq(issues.id, issueId));
      }
    }
    const [row] = await tx
      .select({ supportCount: issues.supportCount })
      .from(issues)
      .where(eq(issues.id, issueId));
    if (support) await recomputePriority(tx, issueId);
    return row!.supportCount;
  });
  emitTo([rooms.issue(issueId), rooms.publicMap], 'issue:updated', { id: issueId, supportCount: result });
  return { supportCount: result, isSupporter: support };
}
