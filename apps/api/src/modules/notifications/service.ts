import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import webpush from 'web-push';
import type { NotificationDTO, NotificationType } from '@urbanfix/shared';
import { config } from '../../config';
import { logger } from '../../core/logger';
import { emitTo, rooms } from '../../core/realtime';
import { type DbOrTx, db, schema } from '../../db/client';
import type { Effects } from '../../lib/effects';
import { decodeCursor, encodeCursor, isoOrNow, iso } from '../../lib/format';

const { notifications, users, pushSubscriptions, issueSupporters, reports } = schema;

if (config.pushAvailable) {
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!);
}

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  issueId?: string | null;
  data?: Record<string, unknown>;
}

/** Persists notifications inside the caller's transaction; delivery is queued when `fx` flushes. */
export async function notifyUsers(
  dbx: DbOrTx,
  fx: Effects,
  recipients: (string | null | undefined)[],
  n: NotificationInput,
  exclude: (string | null | undefined)[] = [],
) {
  const skip = new Set(exclude.filter(Boolean));
  const ids = [...new Set(recipients.filter((r): r is string => Boolean(r) && !skip.has(r)))];
  if (!ids.length) return;

  let targets = ids;
  if (n.type === 'ISSUE_STATUS_CHANGED') {
    // Respect "status updates" opt-outs (verification requests and assignments always go out).
    const rows = await dbx
      .select({ id: users.id, prefs: users.notificationPrefs })
      .from(users)
      .where(inArray(users.id, ids));
    targets = rows.filter((r) => r.prefs?.statusUpdates !== false).map((r) => r.id);
    if (!targets.length) return;
  }

  const inserted = await dbx
    .insert(notifications)
    .values(
      targets.map((userId) => ({
        userId,
        type: n.type,
        title: n.title.slice(0, 160),
        body: n.body,
        issueId: n.issueId ?? null,
        data: n.data ?? {},
      })),
    )
    .returning({ id: notifications.id });
  fx.addNotifications(inserted.map((r) => r.id));
}

/* ---------- audiences ---------- */

export async function issueFollowerIds(dbx: DbOrTx, issueId: string) {
  const rows = await dbx
    .select({ id: issueSupporters.userId })
    .from(issueSupporters)
    .where(eq(issueSupporters.issueId, issueId));
  return rows.map((r) => r.id);
}

export async function issueReporterIds(dbx: DbOrTx, issueId: string) {
  const rows = await dbx
    .selectDistinct({ id: reports.reporterId })
    .from(reports)
    .where(eq(reports.issueId, issueId));
  return rows.map((r) => r.id);
}

/** Officials responsible for a ward (ward-scoped ones plus city-wide ones). */
export async function wardOfficialIds(dbx: DbOrTx, wardId: string | null) {
  const rows = await dbx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, 'OFFICIAL'),
        eq(users.status, 'ACTIVE'),
        wardId ? or(isNull(users.wardId), eq(users.wardId, wardId)) : isNull(users.wardId),
      ),
    );
  return rows.map((r) => r.id);
}

/* ---------- delivery (job) ---------- */

export function toNotificationDTO(n: typeof notifications.$inferSelect): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    issueId: n.issueId,
    data: n.data,
    readAt: iso(n.readAt),
    createdAt: isoOrNow(n.createdAt),
  };
}

export async function deliverNotifications(ids: string[]) {
  if (!ids.length) return;
  const rows = await db.select().from(notifications).where(inArray(notifications.id, ids));
  for (const n of rows) emitTo(rooms.user(n.userId), 'notification:new', toNotificationDTO(n));
  if (!config.pushAvailable) return;

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const subs = await db
    .select({ sub: pushSubscriptions, prefs: users.notificationPrefs })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .where(inArray(pushSubscriptions.userId, userIds));

  await Promise.all(
    rows.flatMap((n) =>
      subs
        .filter((s) => s.sub.userId === n.userId && s.prefs?.push !== false)
        .map(async ({ sub }) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({
                title: n.title,
                body: n.body,
                url: n.issueId ? `/issues/${n.issueId}` : '/notifications',
                tag: n.id,
              }),
              { TTL: 86_400 },
            );
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
            } else {
              logger.warn({ status, err: (err as Error).message }, 'web push failed');
            }
          }
        }),
    ),
  );
}

/* ---------- inbox queries ---------- */

export async function listNotifications(
  userId: string,
  opts: { cursor?: string; limit: number; unread?: boolean },
) {
  const cursor = decodeCursor<[string, string]>(opts.cursor);
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        opts.unread ? isNull(notifications.readAt) : undefined,
        cursor
          ? or(
              lt(notifications.createdAt, new Date(cursor[0])),
              and(eq(notifications.createdAt, new Date(cursor[0])), lt(notifications.id, cursor[1])),
            )
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toNotificationDTO),
    nextCursor: rows.length > opts.limit && last ? encodeCursor([isoOrNow(last.createdAt), last.id]) : null,
  };
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markRead(userId: string, id?: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        id ? eq(notifications.id, id) : undefined,
      ),
    );
}

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}
