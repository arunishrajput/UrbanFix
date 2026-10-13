/**
 * Resolution verification. When an issue is marked RESOLVED a round opens and
 * every reporter is asked to confirm. One "still not fixed" (with a photo)
 * reopens the issue; enough confirmations verify it; when the window closes the
 * round is settled by `evaluateVerification` from @urbanfix/shared.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  bumpPriority,
  evaluateVerification,
  type IssueStatus,
  type VerificationResponseInput,
} from '@urbanfix/shared';
import type { AuthContext } from '../../core/auth';
import { conflict, forbidden, notFound } from '../../core/errors';
import { emitTo, rooms } from '../../core/realtime';
import { type Tx, db, schema } from '../../db/client';
import { categoryById } from '../../lib/categories';
import { Effects } from '../../lib/effects';
import { formatRef } from '../../lib/format';
import { getSettings } from '../../lib/settings';
import { awardReputation } from '../gamification/service';
import { addEvent } from '../issues/events';
import { issueFollowerIds, issueReporterIds, notifyUsers, wardOfficialIds } from '../notifications/service';
import { claimDraftUploads } from '../uploads/service';

const { issues, verificationRounds, verificationResponses, photos, reports } = schema;
type IssueRow = typeof issues.$inferSelect;
type RoundRow = typeof verificationRounds.$inferSelect;

const label = (i: IssueRow) => `${formatRef(i.refNo)} · ${i.title}`;

export async function openRound(tx: Tx, fx: Effects, issue: IssueRow, actorId: string | null) {
  const settings = await getSettings();
  const reporterIds = await issueReporterIds(tx, issue.id);
  const [{ next } = { next: 1 }] = await tx
    .select({ next: sql<number>`coalesce(max(${verificationRounds.roundNo}), 0)::int + 1` })
    .from(verificationRounds)
    .where(eq(verificationRounds.issueId, issue.id));

  // Close any round left pending (e.g. resolved → reopened by an official → resolved again).
  await tx
    .update(verificationRounds)
    .set({ outcome: 'EXPIRED', closedAt: new Date() })
    .where(and(eq(verificationRounds.issueId, issue.id), eq(verificationRounds.outcome, 'PENDING')));

  const closesAt = new Date(Date.now() + settings.windowHours * 3_600_000);
  const [round] = await tx
    .insert(verificationRounds)
    .values({
      issueId: issue.id,
      roundNo: next,
      closesAt,
      eligibleCount: reporterIds.length,
      openedById: actorId,
    })
    .returning();

  await addEvent(tx, {
    issueId: issue.id,
    actorId: null,
    type: 'VERIFICATION_REQUESTED',
    payload: {
      roundId: round!.id,
      roundNo: next,
      closesAt: closesAt.toISOString(),
      eligible: reporterIds.length,
    },
  });
  await notifyUsers(tx, fx, reporterIds, {
    type: 'VERIFICATION_REQUEST',
    title: 'Is it fixed? Please confirm',
    body: `${label(issue)} was marked resolved. Tell us if the problem is really gone.`,
    issueId: issue.id,
    data: { roundId: round!.id, action: 'verify' },
  });
  fx.job(
    'close-verification',
    { roundId: round!.id },
    { delayMs: closesAt.getTime() - Date.now(), jobId: `close-${round!.id}` },
  );
  return round!;
}

async function closeRound(tx: Tx, roundId: string, outcome: RoundRow['outcome']) {
  await tx
    .update(verificationRounds)
    .set({ outcome, closedAt: new Date() })
    .where(eq(verificationRounds.id, roundId));
}

export async function reopenIssue(
  tx: Tx,
  fx: Effects,
  issue: IssueRow,
  opts: {
    actorId: string | null;
    by: 'citizen' | 'official';
    comment?: string | null;
    roundId?: string | null;
  },
) {
  const from = issue.status;
  const category = await categoryById(issue.categoryId);
  await tx
    .update(issues)
    .set({
      status: 'REOPENED',
      resolvedAt: null,
      verifiedAt: null,
      reopenedCount: sql`${issues.reopenedCount} + 1`,
      priority: issue.priorityLocked ? issue.priority : bumpPriority(issue.priority),
      slaDueAt: new Date(Date.now() + (category?.slaHours ?? 72) * 3_600_000),
    })
    .where(eq(issues.id, issue.id));
  await tx
    .update(verificationRounds)
    .set({ outcome: 'REOPENED', closedAt: new Date() })
    .where(and(eq(verificationRounds.issueId, issue.id), eq(verificationRounds.outcome, 'PENDING')));
  await addEvent(tx, {
    issueId: issue.id,
    actorId: opts.actorId,
    type: 'REOPENED',
    fromStatus: from,
    toStatus: 'REOPENED',
    body: opts.comment ?? null,
    payload: { by: opts.by, roundId: opts.roundId ?? null },
  });

  const officials = await wardOfficialIds(tx, issue.wardId);
  await notifyUsers(
    tx,
    fx,
    [issue.assigneeId, ...officials],
    {
      type: 'ISSUE_REOPENED',
      title: 'Issue reopened',
      body:
        opts.by === 'citizen'
          ? `A citizen reports ${label(issue)} is still not fixed.`
          : `${label(issue)} was reopened by an official.`,
      issueId: issue.id,
    },
    [opts.actorId],
  );
  const followers = await issueFollowerIds(tx, issue.id);
  await notifyUsers(
    tx,
    fx,
    followers,
    {
      type: 'ISSUE_STATUS_CHANGED',
      title: 'Issue reopened',
      body: `${label(issue)} is back on the municipal work list.`,
      issueId: issue.id,
      data: { status: 'REOPENED' },
    },
    [opts.actorId],
  );
  fx.broadcast(() => emitTo(rooms.issue(issue.id), 'issue:updated', { id: issue.id, status: 'REOPENED' }));
}

async function verifyIssue(
  tx: Tx,
  fx: Effects,
  issue: IssueRow,
  roundId: string | null,
  actorId: string | null,
) {
  await tx.update(issues).set({ status: 'VERIFIED', verifiedAt: new Date() }).where(eq(issues.id, issue.id));
  if (roundId) await closeRound(tx, roundId, 'VERIFIED');
  await addEvent(tx, {
    issueId: issue.id,
    actorId,
    type: 'VERIFIED',
    fromStatus: 'RESOLVED',
    toStatus: 'VERIFIED',
    payload: { roundId },
  });
  const followers = await issueFollowerIds(tx, issue.id);
  await notifyUsers(tx, fx, [...followers, issue.assigneeId], {
    type: 'ISSUE_VERIFIED',
    title: 'Fix verified by citizens',
    body: `${label(issue)} has been confirmed fixed. Thank you!`,
    issueId: issue.id,
  });
  for (const reporterId of await issueReporterIds(tx, issue.id)) {
    await awardReputation(tx, fx, reporterId, 'ISSUE_VERIFIED', issue.id);
  }
  fx.broadcast(() => emitTo(rooms.issue(issue.id), 'issue:updated', { id: issue.id, status: 'VERIFIED' }));
}

/** Admin override: verify immediately. */
export async function forceVerify(tx: Tx, fx: Effects, issue: IssueRow, actorId: string) {
  const [round] = await tx
    .select()
    .from(verificationRounds)
    .where(and(eq(verificationRounds.issueId, issue.id), eq(verificationRounds.outcome, 'PENDING')));
  await verifyIssue(tx, fx, issue, round?.id ?? null, actorId);
}

async function tally(tx: Tx, round: RoundRow) {
  const rows = await tx
    .select({ response: verificationResponses.response, count: sql<number>`count(*)::int` })
    .from(verificationResponses)
    .where(eq(verificationResponses.roundId, round.id))
    .groupBy(verificationResponses.response);
  const get = (r: string) => rows.find((x) => x.response === r)?.count ?? 0;
  return {
    eligible: round.eligibleCount,
    resolved: get('RESOLVED'),
    notFixed: get('NOT_FIXED'),
    skipped: get('SKIPPED'),
  };
}

export async function respond(auth: AuthContext, issueId: string, input: VerificationResponseInput) {
  const fx = new Effects();
  const result = await db.transaction(async (tx) => {
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).for('update');
    if (!issue) throw notFound('Issue');
    const [round] = await tx
      .select()
      .from(verificationRounds)
      .where(and(eq(verificationRounds.issueId, issueId), eq(verificationRounds.outcome, 'PENDING')))
      .orderBy(desc(verificationRounds.roundNo))
      .limit(1);
    if (issue.status !== 'RESOLVED' || !round) {
      throw conflict('NO_OPEN_VERIFICATION', 'This issue is not waiting for verification');
    }
    const [reporter] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.issueId, issueId), eq(reports.reporterId, auth.id)));
    if (!reporter) throw forbidden('Only citizens who reported this issue can verify it');

    const uploads = await claimDraftUploads(tx, auth.id, input.uploadIds, 'VERIFICATION');
    const inserted = await tx
      .insert(verificationResponses)
      .values({
        roundId: round.id,
        userId: auth.id,
        response: input.response,
        comment: input.comment ?? null,
        photoIds: uploads.map((u) => u.id),
      })
      .onConflictDoNothing()
      .returning({ id: verificationResponses.id });
    if (!inserted.length) throw conflict('ALREADY_RESPONDED', 'You already responded to this verification');

    for (const u of uploads) {
      await tx
        .update(photos)
        .set({ status: 'ATTACHED', issueId, reportId: reporter.id })
        .where(eq(photos.id, u.id));
    }
    if (input.response !== 'SKIPPED') {
      await addEvent(tx, {
        issueId,
        actorId: auth.id,
        type: 'VERIFICATION_RESPONSE',
        body: input.comment ?? null,
        payload: { response: input.response, roundId: round.id, photoIds: uploads.map((u) => u.id) },
      });
      await awardReputation(tx, fx, auth.id, 'VERIFICATION_RESPONSE', round.id);
    }

    const settings = await getSettings();
    const decision = evaluateVerification(await tally(tx, round), settings);
    let status: IssueStatus = issue.status;
    if (decision === 'REOPEN') {
      await reopenIssue(tx, fx, issue, {
        actorId: auth.id,
        by: 'citizen',
        comment: input.comment,
        roundId: round.id,
      });
      status = 'REOPENED';
    } else if (decision === 'VERIFY') {
      await verifyIssue(tx, fx, issue, round.id, null);
      status = 'VERIFIED';
    } else if (decision === 'EXPIRE') {
      await closeRound(tx, round.id, 'EXPIRED');
    }
    return { decision, status };
  });
  await fx.flush();
  return result;
}

/** Job: settles a round when its window closes. */
export async function closeRoundJob(roundId: string) {
  const fx = new Effects();
  await db.transaction(async (tx) => {
    const [round] = await tx
      .select()
      .from(verificationRounds)
      .where(eq(verificationRounds.id, roundId))
      .for('update');
    if (!round || round.outcome !== 'PENDING') return;
    if (round.closesAt.getTime() > Date.now() + 5_000) return; // window was extended / job ran early
    const [issue] = await tx.select().from(issues).where(eq(issues.id, round.issueId)).for('update');
    if (!issue || issue.status !== 'RESOLVED') return closeRound(tx, round.id, 'EXPIRED');

    const decision = evaluateVerification(await tally(tx, round), await getSettings(), true);
    if (decision === 'VERIFY') await verifyIssue(tx, fx, issue, round.id, null);
    else if (decision === 'REOPEN')
      await reopenIssue(tx, fx, issue, { actorId: null, by: 'citizen', roundId: round.id });
    else await closeRound(tx, round.id, 'EXPIRED');
  });
  await fx.flush();
}
