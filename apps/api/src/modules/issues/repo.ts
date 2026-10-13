/**
 * Read models for issues: summaries, detail, lists, map points, timeline.
 */
import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import {
  MUNICIPAL_ROLES,
  type HeatPoint,
  type IssueDetail,
  type IssueSummary,
  type ListIssuesQuery,
  type MapPoint,
  type MapQuery,
  type Paginated,
  type ReportDTO,
  type TimelineEventDTO,
  type VerificationRoundDTO,
  parseBBox,
} from '@urbanfix/shared';
import type { AuthContext } from '../../core/auth';
import { badRequest, notFound } from '../../core/errors';
import { type DbOrTx, db, schema } from '../../db/client';
import { decodeCursor, encodeCursor, formatRef, initials, iso, isoOrNow, publicName } from '../../lib/format';
import { photoUrls, toPhotoDTO } from '../../lib/photos';

const {
  issues,
  categories,
  wards,
  photos,
  users,
  reports,
  issueSupporters,
  issueEvents,
  verificationRounds,
  verificationResponses,
} = schema;

export const summaryColumns = {
  id: issues.id,
  refNo: issues.refNo,
  title: issues.title,
  status: issues.status,
  priority: issues.priority,
  lat: issues.lat,
  lng: issues.lng,
  address: issues.address,
  supportCount: issues.supportCount,
  reportCount: issues.reportCount,
  reporterCount: issues.reporterCount,
  createdAt: issues.createdAt,
  updatedAt: issues.updatedAt,
  lastActivityAt: issues.lastActivityAt,
  categorySlug: categories.slug,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  categoryColor: categories.color,
  wardName: wards.name,
  coverVariants: photos.variants,
  coverThumbhash: photos.thumbhash,
  coverStatus: photos.status,
};

export type SummaryRow = {
  [K in keyof typeof summaryColumns]: (typeof summaryColumns)[K]['_']['data'] | null;
} & { id: string; refNo: number; title: string };

export function summaryQuery(dbx: DbOrTx = db, extra: Record<string, unknown> = {}) {
  return dbx
    .select({ ...summaryColumns, ...(extra as object) })
    .from(issues)
    .innerJoin(categories, eq(categories.id, issues.categoryId))
    .leftJoin(wards, eq(wards.id, issues.wardId))
    .leftJoin(photos, eq(photos.id, issues.coverPhotoId));
}

export function toIssueSummary(r: SummaryRow, distanceM?: number): IssueSummary {
  const cover = r.coverVariants && r.coverStatus !== 'HIDDEN' ? photoUrls(r.coverVariants) : null;
  return {
    id: r.id,
    ref: formatRef(r.refNo),
    title: r.title,
    status: r.status!,
    priority: r.priority!,
    category: {
      slug: r.categorySlug!,
      name: r.categoryName!,
      icon: r.categoryIcon!,
      color: r.categoryColor!,
    },
    lat: r.lat!,
    lng: r.lng!,
    address: r.address ?? null,
    wardName: r.wardName ?? null,
    supportCount: r.supportCount ?? 0,
    reportCount: r.reportCount ?? 0,
    reporterCount: r.reporterCount ?? 0,
    coverPhoto: cover
      ? { url: cover.url, thumbUrl: cover.thumbUrl, thumbhash: r.coverThumbhash ?? null }
      : null,
    createdAt: isoOrNow(r.createdAt),
    updatedAt: isoOrNow(r.updatedAt),
    lastActivityAt: isoOrNow(r.lastActivityAt),
    ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {}),
  };
}

export async function getSummaries(ids: string[], dbx: DbOrTx = db): Promise<Map<string, IssueSummary>> {
  if (!ids.length) return new Map();
  const rows = (await summaryQuery(dbx).where(inArray(issues.id, ids))) as SummaryRow[];
  return new Map(rows.map((r) => [r.id, toIssueSummary(r)]));
}

/* ---------- verification rounds ---------- */

export async function roundsForIssue(dbx: DbOrTx, issueId: string): Promise<VerificationRoundDTO[]> {
  const rounds = await dbx
    .select()
    .from(verificationRounds)
    .where(eq(verificationRounds.issueId, issueId))
    .orderBy(desc(verificationRounds.roundNo));
  if (!rounds.length) return [];
  const tallies = await dbx
    .select({
      roundId: verificationResponses.roundId,
      response: verificationResponses.response,
      count: sql<number>`count(*)::int`,
    })
    .from(verificationResponses)
    .where(
      inArray(
        verificationResponses.roundId,
        rounds.map((r) => r.id),
      ),
    )
    .groupBy(verificationResponses.roundId, verificationResponses.response);
  return rounds.map((r) => {
    const t = { resolved: 0, notFixed: 0, skipped: 0 };
    for (const row of tallies.filter((x) => x.roundId === r.id)) {
      if (row.response === 'RESOLVED') t.resolved = row.count;
      else if (row.response === 'NOT_FIXED') t.notFixed = row.count;
      else t.skipped = row.count;
    }
    return {
      id: r.id,
      roundNo: r.roundNo,
      openedAt: isoOrNow(r.openedAt),
      closesAt: isoOrNow(r.closesAt),
      closedAt: iso(r.closedAt),
      outcome: r.outcome,
      eligibleCount: r.eligibleCount,
      tally: t,
    };
  });
}

/* ---------- detail ---------- */

export async function loadIssueDetail(
  issueId: string,
  viewer: AuthContext | null,
  dbx: DbOrTx = db,
): Promise<IssueDetail> {
  const assignee = schema.users;
  const [row] = (await summaryQuery(dbx, {
    description: issues.description,
    severity: issues.severity,
    wardId: issues.wardId,
    wardCode: wards.code,
    assigneeId: issues.assigneeId,
    resolvedAt: issues.resolvedAt,
    verifiedAt: issues.verifiedAt,
    reopenedCount: issues.reopenedCount,
    slaDueAt: issues.slaDueAt,
    mergedIntoId: issues.mergedIntoId,
  }).where(eq(issues.id, issueId))) as (SummaryRow & {
    description: string | null;
    severity: number | null;
    wardId: string | null;
    wardCode: string | null;
    assigneeId: string | null;
    resolvedAt: Date | null;
    verifiedAt: Date | null;
    reopenedCount: number;
    slaDueAt: Date | null;
    mergedIntoId: string | null;
  })[];
  if (!row) throw notFound('Issue');

  const isMunicipal = viewer ? MUNICIPAL_ROLES.includes(viewer.role) : false;
  const [photoRows, assigneeRow, rounds, reporterRows, viewerRow] = await Promise.all([
    dbx
      .select()
      .from(photos)
      .where(and(eq(photos.issueId, issueId), isMunicipal ? sql`true` : eq(photos.status, 'ATTACHED')))
      .orderBy(asc(photos.createdAt)),
    row.assigneeId
      ? dbx
          .select({ id: assignee.id, name: assignee.name })
          .from(assignee)
          .where(eq(assignee.id, row.assigneeId))
      : Promise.resolve([]),
    roundsForIssue(dbx, issueId),
    dbx
      .select({ name: users.name, isGuest: users.isGuest })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(eq(reports.issueId, issueId))
      .orderBy(asc(reports.createdAt))
      .limit(5),
    viewer
      ? dbx
          .select()
          .from(issueSupporters)
          .where(and(eq(issueSupporters.issueId, issueId), eq(issueSupporters.userId, viewer.id)))
      : Promise.resolve([]),
  ]);

  const supporter = viewerRow[0];
  const isReporter = Boolean(supporter?.isReporter);
  const openRound = rounds.find((r) => r.outcome === 'PENDING') ?? null;
  let myVerification: IssueDetail['viewer']['myVerification'] = null;
  if (viewer && rounds[0]) {
    const [mine] = await dbx
      .select({ response: verificationResponses.response })
      .from(verificationResponses)
      .where(
        and(eq(verificationResponses.roundId, rounds[0].id), eq(verificationResponses.userId, viewer.id)),
      );
    myVerification = mine?.response ?? null;
  }

  return {
    ...toIssueSummary(row),
    description: row.description,
    severity: row.severity,
    ward: row.wardId ? { id: row.wardId, code: row.wardCode ?? '', name: row.wardName ?? '' } : null,
    photos: photoRows.filter((p) => p.kind !== 'WORK_COMPLETION').map(toPhotoDTO),
    workPhotos: photoRows.filter((p) => p.kind === 'WORK_COMPLETION').map(toPhotoDTO),
    assignee: assigneeRow[0] ?? null,
    resolvedAt: iso(row.resolvedAt),
    verifiedAt: iso(row.verifiedAt),
    reopenedCount: row.reopenedCount,
    slaDueAt: iso(row.slaDueAt),
    mergedIntoId: row.mergedIntoId,
    verificationRounds: rounds,
    reporterInitials: reporterRows.map((r) => (r.isGuest ? 'G' : initials(r.name))),
    viewer: {
      isSupporter: Boolean(supporter),
      isReporter,
      pendingVerification: openRound && isReporter && !myVerification ? openRound : null,
      myVerification,
    },
  };
}

/* ---------- lists ---------- */

export function issueFilters(q: {
  status?: string[];
  category?: string[];
  priority?: string[];
  wardId?: string;
  q?: string;
  from?: Date;
  to?: Date;
}): SQL[] {
  const where: SQL[] = [sql`${issues.mergedIntoId} IS NULL`];
  if (q.status?.length) where.push(inArray(issues.status, q.status as (typeof issues.status._.data)[]));
  if (q.priority?.length)
    where.push(inArray(issues.priority, q.priority as (typeof issues.priority._.data)[]));
  if (q.category?.length) where.push(inArray(categories.slug, q.category));
  if (q.wardId) where.push(eq(issues.wardId, q.wardId));
  if (q.from) where.push(sql`${issues.createdAt} >= ${q.from}`);
  if (q.to) where.push(sql`${issues.createdAt} <= ${q.to}`);
  if (q.q) {
    const ref = /^uf-?0*(\d+)$/i.exec(q.q.trim());
    where.push(
      ref
        ? eq(issues.refNo, Number(ref[1]))
        : or(
            sql`${issues.search} @@ websearch_to_tsquery('english', ${q.q})`,
            sql`${issues.title} ILIKE ${'%' + q.q.replace(/[%_\\]/g, (c) => '\\' + c) + '%'}`,
          )!,
    );
  }
  return where;
}

export async function listIssues(q: ListIssuesQuery): Promise<Paginated<IssueSummary>> {
  const where = issueFilters(q);
  const hasPoint = q.lat != null && q.lng != null;
  const point = hasPoint ? sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography` : null;
  const distance = point ? sql<number>`ST_Distance(${issues.location}, ${point})` : sql<number>`NULL`;

  // Keyset pagination for the time-ordered sorts; offset for the score-ordered ones.
  const cursor = decodeCursor<[string, string] | [number]>(q.cursor);
  let order: SQL[];
  let offset = 0;
  switch (q.sort) {
    case 'support':
      order = [desc(issues.supportCount), desc(issues.createdAt)];
      offset = (cursor?.[0] as number) ?? 0;
      break;
    case 'priority':
      order = [
        sql`array_position(ARRAY['CRITICAL','HIGH','MEDIUM','LOW']::priority[], ${issues.priority})`,
        desc(issues.createdAt),
      ];
      offset = (cursor?.[0] as number) ?? 0;
      break;
    case 'nearest':
      if (!point) throw badRequest('lat and lng are required for sort=nearest');
      order = [sql`${issues.location} <-> ${point}`];
      offset = (cursor?.[0] as number) ?? 0;
      break;
    case 'updated':
      order = [desc(issues.lastActivityAt), desc(issues.id)];
      if (cursor)
        where.push(
          sql`(${issues.lastActivityAt}, ${issues.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)`,
        );
      break;
    default:
      order = [desc(issues.createdAt), desc(issues.id)];
      if (cursor)
        where.push(
          sql`(${issues.createdAt}, ${issues.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)`,
        );
  }

  const rows = (await summaryQuery(db, { distance })
    .where(and(...where))
    .orderBy(...order)
    .limit(q.limit + 1)
    .offset(offset)) as (SummaryRow & { distance: number | null })[];

  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  let nextCursor: string | null = null;
  if (rows.length > q.limit && last) {
    nextCursor =
      q.sort === 'updated'
        ? encodeCursor([isoOrNow(last.lastActivityAt), last.id])
        : q.sort === 'newest'
          ? encodeCursor([isoOrNow(last.createdAt), last.id])
          : encodeCursor([offset + q.limit]);
  }
  return { items: page.map((r) => toIssueSummary(r, r.distance ?? undefined)), nextCursor };
}

export async function nearbyIssues(
  lat: number,
  lng: number,
  radiusM: number,
  limit: number,
): Promise<IssueSummary[]> {
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
  const rows = (await summaryQuery(db, { distance: sql<number>`ST_Distance(${issues.location}, ${point})` })
    .where(
      and(
        sql`${issues.mergedIntoId} IS NULL`,
        sql`${issues.status} <> 'REJECTED'`,
        sql`ST_DWithin(${issues.location}, ${point}, ${radiusM})`,
      ),
    )
    .orderBy(sql`${issues.location} <-> ${point}`)
    .limit(limit)) as (SummaryRow & { distance: number })[];
  return rows.map((r) => toIssueSummary(r, r.distance));
}

function bboxWhere(q: MapQuery): SQL[] {
  const bbox = parseBBox(q.bbox);
  if (!bbox) throw badRequest('bbox must be "west,south,east,north"');
  return [
    ...issueFilters({ ...q, category: q.category }),
    sql`${issues.location} && ST_MakeEnvelope(${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}, 4326)::geography`,
  ];
}

const MAP_LIMIT = 5000;

export async function mapPoints(q: MapQuery): Promise<{ points: MapPoint[]; truncated: boolean }> {
  const rows = await db
    .select({
      id: issues.id,
      lat: issues.lat,
      lng: issues.lng,
      status: issues.status,
      priority: issues.priority,
      category: categories.slug,
      supportCount: issues.supportCount,
      title: issues.title,
    })
    .from(issues)
    .innerJoin(categories, eq(categories.id, issues.categoryId))
    .where(and(...bboxWhere(q)))
    .orderBy(desc(issues.lastActivityAt))
    .limit(MAP_LIMIT + 1);
  return { points: rows.slice(0, MAP_LIMIT), truncated: rows.length > MAP_LIMIT };
}

/** Heat intensity grows with support (log-scaled) so one viral issue doesn't wash out the map. */
export async function heatPoints(q: MapQuery): Promise<HeatPoint[]> {
  const rows = await db
    .select({ lat: issues.lat, lng: issues.lng, support: issues.supportCount })
    .from(issues)
    .innerJoin(categories, eq(categories.id, issues.categoryId))
    .where(and(...bboxWhere(q)))
    .limit(20_000);
  return rows.map((r) => [
    Math.round(r.lat * 1e5) / 1e5,
    Math.round(r.lng * 1e5) / 1e5,
    Math.round(Math.min(1, 0.3 + Math.log10(1 + r.support) / 2) * 100) / 100,
  ]);
}

/* ---------- timeline & reports ---------- */

export async function timeline(issueId: string, viewer: AuthContext | null): Promise<TimelineEventDTO[]> {
  const showInternal = viewer ? MUNICIPAL_ROLES.includes(viewer.role) : false;
  const rows = await db
    .select({ e: issueEvents, actorName: users.name, actorRole: users.role, actorGuest: users.isGuest })
    .from(issueEvents)
    .leftJoin(users, eq(users.id, issueEvents.actorId))
    .where(
      and(eq(issueEvents.issueId, issueId), showInternal ? undefined : eq(issueEvents.isInternal, false)),
    )
    .orderBy(asc(issueEvents.createdAt));
  return rows.map(({ e, actorName, actorRole, actorGuest }) => ({
    id: e.id,
    type: e.type,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    body: e.body,
    actor:
      actorName && actorRole
        ? {
            name:
              actorRole === 'CITIZEN' && !showInternal
                ? publicName(actorName, Boolean(actorGuest))
                : actorName,
            role: actorRole,
          }
        : null,
    payload: e.payload,
    isInternal: e.isInternal,
    createdAt: isoOrNow(e.createdAt),
  }));
}

export async function reportsForIssue(issueId: string, viewer: AuthContext | null): Promise<ReportDTO[]> {
  const isMunicipal = viewer ? MUNICIPAL_ROLES.includes(viewer.role) : false;
  const rows = await db
    .select({
      r: reports,
      name: users.name,
      isGuest: users.isGuest,
      distance: sql<number>`ST_Distance(${reports.location}, ${issues.location})`,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .innerJoin(issues, eq(issues.id, reports.issueId))
    .where(
      and(
        eq(reports.issueId, issueId),
        isMunicipal ? undefined : sql`${reports.moderationStatus} <> 'REJECTED'`,
      ),
    )
    .orderBy(asc(reports.createdAt));
  const photoRows = rows.length
    ? await db
        .select()
        .from(photos)
        .where(
          and(
            inArray(
              photos.reportId,
              rows.map((x) => x.r.id),
            ),
            isMunicipal ? undefined : eq(photos.status, 'ATTACHED'),
          ),
        )
        .orderBy(asc(photos.createdAt))
    : [];
  return rows.map(({ r, name, isGuest, distance }) => ({
    id: r.id,
    source: r.source,
    description: r.description,
    photos: photoRows.filter((p) => p.reportId === r.id).map(toPhotoDTO),
    createdAt: isoOrNow(r.createdAt),
    reporter: {
      displayName: publicName(name, isGuest),
      initials: isGuest ? 'G' : initials(name),
      isYou: viewer?.id === r.reporterId,
    },
    distanceFromIssueM: Math.round(distance ?? 0),
    moderationStatus: r.moderationStatus,
  }));
}
