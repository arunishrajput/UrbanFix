import { and, eq, sql } from 'drizzle-orm';
import {
  BADGES,
  REPUTATION,
  earnedBadgeCodes,
  reputationLevel,
  type BadgeDTO,
  type ContributionStats,
  type ReputationReason,
} from '@urbanfix/shared';
import { type DbOrTx, db, schema } from '../../db/client';
import { Effects } from '../../lib/effects';
import { iso } from '../../lib/format';
import { notifyUsers } from '../notifications/service';

const { reputationEvents, users, userBadges } = schema;

/**
 * Awards reputation once per (user, reason, reference). Re-running the same
 * award is a no-op, so workflows can call this without bookkeeping.
 */
export async function awardReputation(
  dbx: DbOrTx,
  fx: Effects,
  userId: string,
  reason: ReputationReason,
  refId: string | null,
) {
  const delta = REPUTATION[reason];
  const inserted = await dbx
    .insert(reputationEvents)
    .values({ userId, delta, reason, refId })
    .onConflictDoNothing()
    .returning({ id: reputationEvents.id });
  if (!inserted.length) return;
  await dbx
    .update(users)
    .set({ reputation: sql`greatest(0, ${users.reputation} + ${delta})` })
    .where(eq(users.id, userId));
  fx.job('award-badges', { userId }, { jobId: `badges-${userId}-${Date.now() >> 14}` });
}

export async function contributionStats(
  userId: string,
): Promise<ContributionStats & { supportGiven: number; resolvedCount: number }> {
  const res = await db.execute<{
    reports_created: number;
    reports_joined: number;
    verifications: number;
    issues_verified: number;
    eagle_eye: number;
    support_given: number;
    resolved_count: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM reports WHERE reporter_id = ${userId} AND source = 'NEW') AS reports_created,
      (SELECT count(*)::int FROM reports WHERE reporter_id = ${userId} AND source = 'JOINED') AS reports_joined,
      (SELECT count(*)::int FROM verification_responses WHERE user_id = ${userId} AND response <> 'SKIPPED') AS verifications,
      (SELECT count(DISTINCT r.issue_id)::int FROM reports r JOIN issues i ON i.id = r.issue_id
         WHERE r.reporter_id = ${userId} AND i.status = 'VERIFIED') AS issues_verified,
      (SELECT count(*)::int FROM reports r JOIN issues i ON i.id = r.issue_id
         WHERE r.reporter_id = ${userId} AND r.source = 'NEW' AND i.support_count >= 10) AS eagle_eye,
      (SELECT count(*)::int FROM issue_supporters WHERE user_id = ${userId} AND NOT is_reporter) AS support_given,
      (SELECT count(DISTINCT r.issue_id)::int FROM reports r JOIN issues i ON i.id = r.issue_id
         WHERE r.reporter_id = ${userId} AND i.status IN ('RESOLVED','VERIFIED')) AS resolved_count`);
  const r = res.rows[0]!;
  return {
    reportsCreated: r.reports_created,
    reportsJoined: r.reports_joined,
    verifications: r.verifications,
    issuesVerified: r.issues_verified,
    eagleEyeIssues: r.eagle_eye,
    supportGiven: r.support_given,
    resolvedCount: r.resolved_count,
  };
}

/** Job: grants newly earned badges and notifies the citizen. */
export async function evaluateBadges(userId: string) {
  const stats = await contributionStats(userId);
  const earned = earnedBadgeCodes(stats);
  if (!earned.length) return;
  const fx = new Effects();
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(userBadges)
      .values(earned.map((badgeCode) => ({ userId, badgeCode })))
      .onConflictDoNothing()
      .returning({ code: userBadges.badgeCode });
    for (const { code } of inserted) {
      const badge = BADGES.find((b) => b.code === code)!;
      await notifyUsers(tx, fx, [userId], {
        type: 'BADGE_EARNED',
        title: `Badge unlocked: ${badge.name}`,
        body: badge.description,
        data: { badge: code },
      });
    }
  });
  await fx.flush();
}

export async function badgesFor(userId: string, stats: ContributionStats): Promise<BadgeDTO[]> {
  const rows = await db.select().from(userBadges).where(eq(userBadges.userId, userId));
  const earnedAt = new Map(rows.map((r) => [r.badgeCode, r.awardedAt]));
  return BADGES.map((b) => ({
    code: b.code,
    name: b.name,
    description: b.description,
    icon: b.icon,
    earnedAt: iso(earnedAt.get(b.code)),
    progress: b.progress(stats),
  }));
}

export { reputationLevel };

export async function hasBadge(userId: string, code: string) {
  const [row] = await db
    .select()
    .from(userBadges)
    .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeCode, code)));
  return Boolean(row);
}
