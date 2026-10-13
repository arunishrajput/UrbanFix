import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  cursorQuery,
  reputationLevel,
  updateProfileSchema,
  type MyReportRow,
  type NotificationPrefs,
  type PendingVerification,
  type ProfileDTO,
} from '@urbanfix/shared';
import { notFound } from '../../core/errors';
import { authOf, requireAuth } from '../../core/rbac';
import { db, schema } from '../../db/client';
import { decodeCursor, encodeCursor, isoOrNow } from '../../lib/format';
import { toAuthUser } from '../auth/service';
import { badgesFor, contributionStats } from '../gamification/service';
import { getSummaries, roundsForIssue, summaryQuery, toIssueSummary, type SummaryRow } from '../issues/repo';

const { users, reports, issues, verificationRounds, verificationResponses } = schema;

const DEFAULT_PREFS: NotificationPrefs = { push: true, statusUpdates: true, verificationRequests: true };

async function profile(userId: string): Promise<ProfileDTO> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw notFound('User');
  const stats = await contributionStats(userId);
  const level = reputationLevel(user.reputation);
  return {
    user: {
      ...toAuthUser(user),
      phone: user.phone,
      notificationPrefs: { ...DEFAULT_PREFS, ...user.notificationPrefs },
    },
    level: { ...level, next: level.next ? { min: level.next.min, name: level.next.name } : null },
    stats: { ...stats, reputation: user.reputation },
    badges: await badgesFor(userId, stats),
  };
}

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.get('/profile', { schema: { tags: ['me'] } }, (req) => profile(authOf(req).id));

  app.patch('/profile', { schema: { tags: ['me'], body: updateProfileSchema } }, async (req) => {
    const id = authOf(req).id;
    const current = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!current) throw notFound('User');
    await db
      .update(users)
      .set({
        ...(req.body.name ? { name: req.body.name } : {}),
        ...(req.body.phone !== undefined ? { phone: req.body.phone } : {}),
        ...(req.body.notificationPrefs
          ? {
              notificationPrefs: {
                ...DEFAULT_PREFS,
                ...current.notificationPrefs,
                ...req.body.notificationPrefs,
              },
            }
          : {}),
      })
      .where(eq(users.id, id));
    return profile(id);
  });

  app.get(
    '/reports',
    {
      schema: {
        tags: ['me'],
        querystring: cursorQuery.extend({ type: z.enum(['submitted', 'joined', 'all']).default('all') }),
      },
    },
    async (req) => {
      const id = authOf(req).id;
      const cursor = decodeCursor<[string, string]>(req.query.cursor);
      const rows = (await summaryQuery(db, {
        source: reports.source,
        reportedAt: reports.createdAt,
        reportId: reports.id,
      })
        .innerJoin(reports, eq(reports.issueId, issues.id))
        .where(
          and(
            eq(reports.reporterId, id),
            req.query.type === 'submitted' ? eq(reports.source, 'NEW') : undefined,
            req.query.type === 'joined' ? inArray(reports.source, ['JOINED', 'MERGED']) : undefined,
            cursor
              ? sql`(${reports.createdAt}, ${reports.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(reports.createdAt), desc(reports.id))
        .limit(req.query.limit + 1)) as (SummaryRow & {
        source: MyReportRow['source'];
        reportedAt: Date;
        reportId: string;
      })[];
      const page = rows.slice(0, req.query.limit);
      const last = page[page.length - 1];
      return {
        items: page.map((r): MyReportRow => ({
          ...toIssueSummary(r),
          source: r.source,
          reportedAt: isoOrNow(r.reportedAt),
        })),
        nextCursor:
          rows.length > req.query.limit && last
            ? encodeCursor([isoOrNow(last.reportedAt), last.reportId])
            : null,
      };
    },
  );

  /** Resolved issues waiting for this citizen's verdict. */
  app.get(
    '/verifications/pending',
    { schema: { tags: ['me'] } },
    async (req): Promise<{ items: PendingVerification[] }> => {
      const id = authOf(req).id;
      const rows = await db
        .select({ issueId: verificationRounds.issueId })
        .from(verificationRounds)
        .innerJoin(reports, and(eq(reports.issueId, verificationRounds.issueId), eq(reports.reporterId, id)))
        .innerJoin(issues, eq(issues.id, verificationRounds.issueId))
        .where(
          and(
            eq(verificationRounds.outcome, 'PENDING'),
            eq(issues.status, 'RESOLVED'),
            sql`NOT EXISTS (SELECT 1 FROM ${verificationResponses} vr WHERE vr.round_id = ${verificationRounds.id} AND vr.user_id = ${id})`,
          ),
        )
        .orderBy(desc(verificationRounds.openedAt))
        .limit(20);
      const ids = rows.map((r) => r.issueId);
      const summaries = await getSummaries(ids);
      const items: PendingVerification[] = [];
      for (const issueId of ids) {
        const issue = summaries.get(issueId);
        const round = (await roundsForIssue(db, issueId)).find((r) => r.outcome === 'PENDING');
        if (issue && round) items.push({ issue, round });
      }
      return { items };
    },
  );
};
