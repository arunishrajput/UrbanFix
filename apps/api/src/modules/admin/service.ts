import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type {
  AdminCreateUserInput,
  AdminUserRow,
  AuditLogDTO,
  CategoryUpsertInput,
  ModerationItem,
  PagedResult,
  UserRole,
  UserStatus,
  WardUpsertInput,
} from '@urbanfix/shared';
import type { AuthContext } from '../../core/auth';
import { hashPassword } from '../../core/auth';
import { badRequest, conflict, notFound } from '../../core/errors';
import { db, schema } from '../../db/client';
import { audit } from '../../lib/audit';
import { invalidateCategories } from '../../lib/categories';
import { Effects } from '../../lib/effects';
import { isoOrNow, iso } from '../../lib/format';
import { toPhotoDTO } from '../../lib/photos';
import { setSuspended, toAuthUser } from '../auth/service';
import { awardReputation } from '../gamification/service';
import { addEvent } from '../issues/events';

const { users, wards, categories, reports, photos, issues, auditLogs } = schema;

/* ---------- users ---------- */

export async function listUsers(q: {
  page: number;
  pageSize: number;
  q?: string;
  role?: UserRole;
  status?: UserStatus;
}): Promise<PagedResult<AdminUserRow>> {
  const where = and(
    q.q ? or(ilike(users.name, `%${q.q}%`), ilike(sql`${users.email}::text`, `%${q.q}%`)) : undefined,
    q.role ? eq(users.role, q.role) : undefined,
    q.status ? eq(users.status, q.status) : undefined,
  );
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        u: users,
        wardName: wards.name,
        reportCount: sql<number>`(SELECT count(*)::int FROM reports r WHERE r.reporter_id = ${users.id})`,
      })
      .from(users)
      .leftJoin(wards, eq(wards.id, users.wardId))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(where),
  ]);
  return {
    items: rows.map(({ u, wardName, reportCount }) => ({
      ...toAuthUser(u),
      phone: u.phone,
      status: u.status,
      wardName,
      reportCount,
      lastSeenAt: iso(u.lastSeenAt),
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

export async function createUser(input: AdminCreateUserInput, req: FastifyRequest) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
  if (input.wardId) await assertWard(input.wardId);
  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      wardId: input.wardId ?? null,
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  await audit(db, req, {
    action: 'user.create',
    entityType: 'user',
    entityId: user!.id,
    diff: { role: input.role },
  });
  return toAuthUser(user!);
}

export async function updateUser(
  auth: AuthContext,
  id: string,
  input: { name?: string; role?: UserRole; status?: UserStatus; wardId?: string | null },
  req: FastifyRequest,
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) throw notFound('User');
  if (id === auth.id && ((input.role && input.role !== 'ADMIN') || input.status === 'SUSPENDED')) {
    throw badRequest('You cannot demote or suspend your own account');
  }
  if (input.wardId) await assertWard(input.wardId);
  const [updated] = await db.update(users).set(input).where(eq(users.id, id)).returning();
  if (input.status && input.status !== user.status) await setSuspended(id, input.status === 'SUSPENDED');
  await audit(db, req, { action: 'user.update', entityType: 'user', entityId: id, diff: input });
  return toAuthUser(updated!);
}

async function assertWard(id: string) {
  const ward = await db.query.wards.findFirst({ where: eq(wards.id, id) });
  if (!ward) throw badRequest('Unknown ward');
}

/* ---------- categories ---------- */

export async function listAllCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function upsertCategory(id: string | null, input: CategoryUpsertInput, req: FastifyRequest) {
  const clash = await db.query.categories.findFirst({ where: eq(categories.slug, input.slug) });
  if (clash && clash.id !== id) throw conflict('SLUG_TAKEN', 'Another category already uses this slug');
  const [row] = id
    ? await db.update(categories).set(input).where(eq(categories.id, id)).returning()
    : await db.insert(categories).values(input).returning();
  if (!row) throw notFound('Category');
  invalidateCategories();
  await audit(db, req, {
    action: id ? 'category.update' : 'category.create',
    entityType: 'category',
    entityId: row.id,
    diff: input,
  });
  return row;
}

/** Categories in use are deactivated rather than deleted so history stays intact. */
export async function deleteCategory(id: string, req: FastifyRequest) {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issues)
    .where(eq(issues.categoryId, id));
  if (count > 0) {
    await db.update(categories).set({ isActive: false }).where(eq(categories.id, id));
  } else {
    await db.delete(categories).where(eq(categories.id, id));
  }
  invalidateCategories();
  await audit(db, req, {
    action: 'category.delete',
    entityType: 'category',
    entityId: id,
    diff: { deactivated: count > 0 },
  });
  return { deleted: count === 0, deactivated: count > 0 };
}

/* ---------- wards ---------- */

export async function upsertWard(id: string | null, input: WardUpsertInput, req: FastifyRequest) {
  const clash = await db.query.wards.findFirst({ where: eq(wards.code, input.code) });
  if (clash && clash.id !== id) throw conflict('CODE_TAKEN', 'Another ward already uses this code');
  const boundary =
    input.boundary === undefined
      ? undefined
      : input.boundary === null
        ? null
        : sql`ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.boundary)}), 4326)))`;
  const values = {
    code: input.code,
    name: input.name,
    isActive: input.isActive,
    ...(boundary !== undefined ? { boundary } : {}),
  };
  const [row] = id
    ? await db.update(wards).set(values).where(eq(wards.id, id)).returning({ id: wards.id })
    : await db.insert(wards).values(values).returning({ id: wards.id });
  if (!row) throw notFound('Ward');
  // Keep a centre point for nearest-ward fallback and map labels.
  await db.execute(sql`
    UPDATE wards SET
      center_lat = CASE WHEN boundary IS NULL THEN center_lat ELSE ST_Y(ST_PointOnSurface(boundary)) END,
      center_lng = CASE WHEN boundary IS NULL THEN center_lng ELSE ST_X(ST_PointOnSurface(boundary)) END
    WHERE id = ${row.id}`);
  await audit(db, req, {
    action: id ? 'ward.update' : 'ward.create',
    entityType: 'ward',
    entityId: row.id,
    diff: { code: input.code, name: input.name, boundary: input.boundary ? 'updated' : input.boundary },
  });
  return row;
}

/* ---------- moderation ---------- */

export async function moderationQueue(q: {
  page: number;
  pageSize: number;
  status: 'FLAGGED' | 'PENDING' | 'REJECTED';
}) {
  const where = eq(reports.moderationStatus, q.status);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        r: reports,
        issueRef: issues.refNo,
        issueTitle: issues.title,
        name: users.name,
        email: users.email,
      })
      .from(reports)
      .innerJoin(issues, eq(issues.id, reports.issueId))
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(reports)
      .where(where),
  ]);
  const photoRows = rows.length
    ? await db
        .select()
        .from(photos)
        .where(
          inArray(
            photos.reportId,
            rows.map((x) => x.r.id),
          ),
        )
    : [];
  const items: ModerationItem[] = rows.map(({ r, issueRef, issueTitle, name, email }) => ({
    reportId: r.id,
    issueId: r.issueId,
    issueRef: `UF-${String(issueRef).padStart(6, '0')}`,
    issueTitle,
    moderationStatus: r.moderationStatus,
    description: r.description,
    photos: photoRows
      .filter((p) => p.reportId === r.id)
      .map((p) => ({
        ...toPhotoDTO(p),
        flags: p.moderationFlags,
        reason: p.analysis?.moderation.reason ?? null,
      })),
    reporter: { id: r.reporterId, name, email },
    createdAt: isoOrNow(r.createdAt),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export async function decideModeration(
  auth: AuthContext,
  reportId: string,
  action: 'APPROVE' | 'REJECT',
  reason: string | undefined,
  req: FastifyRequest,
) {
  const fx = new Effects();
  await db.transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, reportId)).for('update');
    if (!report) throw notFound('Report');
    const [issue] = await tx.select().from(issues).where(eq(issues.id, report.issueId)).for('update');
    if (action === 'APPROVE') {
      await tx.update(reports).set({ moderationStatus: 'APPROVED' }).where(eq(reports.id, reportId));
      await tx
        .update(photos)
        .set({ status: 'ATTACHED' })
        .where(and(eq(photos.reportId, reportId), eq(photos.status, 'HIDDEN')));
      if (issue && !issue.coverPhotoId) {
        const [p] = await tx
          .select({ id: photos.id })
          .from(photos)
          .where(eq(photos.reportId, reportId))
          .limit(1);
        if (p) await tx.update(issues).set({ coverPhotoId: p.id }).where(eq(issues.id, issue.id));
      }
    } else {
      await tx.update(reports).set({ moderationStatus: 'REJECTED' }).where(eq(reports.id, reportId));
      await tx.update(photos).set({ status: 'HIDDEN' }).where(eq(photos.reportId, reportId));
      await awardReputation(tx, fx, report.reporterId, 'REPORT_REJECTED_SPAM', report.id);
      // An issue whose only evidence was rejected is closed.
      if (issue && issue.reportCount <= 1 && report.source === 'NEW' && issue.status !== 'REJECTED') {
        await tx
          .update(issues)
          .set({ status: 'REJECTED', coverPhotoId: null })
          .where(eq(issues.id, issue.id));
        await addEvent(tx, {
          issueId: issue.id,
          actorId: auth.id,
          type: 'STATUS_CHANGED',
          fromStatus: issue.status,
          toStatus: 'REJECTED',
          body: 'Removed by moderation',
        });
      } else if (issue?.coverPhotoId) {
        const [cover] = await tx.select().from(photos).where(eq(photos.id, issue.coverPhotoId));
        if (cover?.reportId === reportId) {
          const [next] = await tx
            .select({ id: photos.id })
            .from(photos)
            .where(and(eq(photos.issueId, issue.id), eq(photos.status, 'ATTACHED')))
            .limit(1);
          await tx
            .update(issues)
            .set({ coverPhotoId: next?.id ?? null })
            .where(eq(issues.id, issue.id));
        }
      }
    }
    if (issue) {
      await addEvent(tx, {
        issueId: issue.id,
        actorId: auth.id,
        type: 'MODERATED',
        body: reason ?? null,
        payload: { reportId, action },
        isInternal: true,
      });
    }
    await audit(tx, req, {
      action: `moderation.${action.toLowerCase()}`,
      entityType: 'report',
      entityId: reportId,
      diff: { reason },
    });
  });
  await fx.flush();
}

/* ---------- audit ---------- */

export async function listAudit(q: {
  page: number;
  pageSize: number;
  entityType?: string;
  actorId?: string;
}) {
  const where = and(
    q.entityType ? eq(auditLogs.entityType, q.entityType) : undefined,
    q.actorId ? eq(auditLogs.actorId, q.actorId) : undefined,
  );
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({ a: auditLogs, name: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
  ]);
  const items: AuditLogDTO[] = rows.map(({ a, name }) => ({
    id: a.id,
    actor: a.actorId && name ? { id: a.actorId, name } : null,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    diff: a.diff,
    ip: a.ip,
    createdAt: isoOrNow(a.createdAt),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}
