/**
 * Analytics for officials and admins. Time series read the `daily_issue_stats`
 * materialized view; breakdowns query `issues` directly (indexed, small enough
 * at municipal scale).
 */
import { sql, type SQL } from 'drizzle-orm';
import type {
  AnalyticsOverview,
  AnalyticsQuery,
  CategoryStat,
  DailyPoint,
  ParticipationPoint,
  ResolutionBucket,
  WardStat,
} from '@urbanfix/shared';
import type { AuthContext } from '../../core/auth';
import { db } from '../../db/client';

const DAY = 86_400_000;
const round1 = (n: unknown) => (n == null ? null : Math.round(Number(n) * 10) / 10);
const ratio = (n: unknown) => (n == null ? null : Math.round(Number(n) * 1000) / 1000);

interface Range {
  from: Date;
  to: Date;
  wardId?: string;
  category?: string;
}

/** Defaults to the last 90 days; ward-scoped officials are pinned to their ward. */
export function resolveRange(q: AnalyticsQuery, auth: AuthContext): Range {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 90 * DAY);
  const wardId = auth.role !== 'ADMIN' && auth.wardId ? auth.wardId : q.wardId;
  return { from, to, wardId, category: q.category };
}

function issueWhere(r: Range, alias = 'i'): SQL {
  const a = sql.raw(alias);
  return sql`${a}.merged_into_id IS NULL
    AND ${a}.created_at >= ${r.from} AND ${a}.created_at <= ${r.to}
    ${r.wardId ? sql`AND ${a}.ward_id = ${r.wardId}` : sql``}
    ${r.category ? sql`AND ${a}.category_id = (SELECT id FROM categories WHERE slug = ${r.category})` : sql``}`;
}

export async function overview(r: Range): Promise<AnalyticsOverview> {
  const res = await db.execute<Record<string, number | null>>(sql`
    WITH scoped AS (SELECT * FROM issues i WHERE ${issueWhere(r)}),
    rep AS (
      SELECT r.* FROM reports r JOIN scoped s ON s.id = r.issue_id
    )
    SELECT
      (SELECT count(*) FROM scoped)::int AS total,
      (SELECT count(*) FROM scoped WHERE status IN ('PENDING','IN_PROGRESS','REOPENED'))::int AS open,
      (SELECT count(*) FROM scoped WHERE status IN ('RESOLVED','VERIFIED'))::int AS resolved,
      (SELECT count(*) FROM scoped WHERE status = 'VERIFIED')::int AS verified,
      (SELECT avg(extract(epoch FROM resolved_at - created_at) / 3600) FROM scoped WHERE resolved_at IS NOT NULL) AS avg_hours,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM resolved_at - created_at) / 3600)
         FROM scoped WHERE resolved_at IS NOT NULL) AS median_hours,
      (SELECT count(DISTINCT reporter_id) FROM rep)::int AS active_citizens,
      (SELECT count(*) FROM rep)::int AS total_reports,
      (SELECT count(*) FROM rep WHERE source IN ('JOINED','MERGED'))::int AS joined_reports,
      (SELECT count(*) FILTER (WHERE sla_due_at IS NULL OR resolved_at <= sla_due_at)::float / nullif(count(*), 0)
         FROM scoped WHERE resolved_at IS NOT NULL) AS sla_compliance,
      (SELECT count(*) FILTER (WHERE reopened_count > 0)::float
         / nullif(count(*) FILTER (WHERE status IN ('RESOLVED','VERIFIED','REOPENED')), 0) FROM scoped) AS reopen_rate`);
  const s = res.rows[0]!;
  const totalReports = Number(s.total_reports ?? 0);
  return {
    totalIssues: Number(s.total),
    openIssues: Number(s.open),
    resolvedIssues: Number(s.resolved),
    verifiedIssues: Number(s.verified),
    avgResolutionHours: round1(s.avg_hours),
    medianResolutionHours: round1(s.median_hours),
    activeCitizens: Number(s.active_citizens),
    totalReports,
    joinedReports: Number(s.joined_reports),
    joinRate: totalReports ? ratio(Number(s.joined_reports) / totalReports)! : 0,
    slaCompliance: ratio(s.sla_compliance),
    reopenRate: ratio(s.reopen_rate) ?? 0,
  };
}

export async function reportsPerDay(r: Range): Promise<DailyPoint[]> {
  const res = await db.execute<{ day: string; created: number; resolved: number }>(sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, sum(created)::int AS created, sum(resolved)::int AS resolved
    FROM daily_issue_stats
    WHERE day >= ${r.from}::date AND day <= ${r.to}::date
      ${r.wardId ? sql`AND ward_key = ${r.wardId}` : sql``}
      ${r.category ? sql`AND category_id = (SELECT id FROM categories WHERE slug = ${r.category})` : sql``}
    GROUP BY day ORDER BY day`);
  const byDay = new Map(res.rows.map((row) => [row.day, row]));
  const points: DailyPoint[] = [];
  for (
    let t = Date.UTC(r.from.getUTCFullYear(), r.from.getUTCMonth(), r.from.getUTCDate());
    t <= r.to.getTime();
    t += DAY
  ) {
    const day = new Date(t).toISOString().slice(0, 10);
    const row = byDay.get(day);
    points.push({ date: day, created: row?.created ?? 0, resolved: row?.resolved ?? 0 });
  }
  return points;
}

export async function resolutionTime(
  r: Range,
): Promise<{ buckets: ResolutionBucket[]; byCategory: CategoryStat[] }> {
  const res = await db.execute<{ bucket: string; count: number }>(sql`
    WITH h AS (
      SELECT extract(epoch FROM resolved_at - created_at) / 3600 AS hours FROM issues i
      WHERE ${issueWhere(r)} AND resolved_at IS NOT NULL
    )
    SELECT b.label AS bucket, count(h.hours)::int AS count
    FROM (VALUES (1, '< 1 day', 0, 24), (2, '1–3 days', 24, 72), (3, '3–7 days', 72, 168),
                 (4, '1–2 weeks', 168, 336), (5, '> 2 weeks', 336, 1e9)) AS b(ord, label, lo, hi)
    LEFT JOIN h ON h.hours >= b.lo AND h.hours < b.hi
    GROUP BY b.ord, b.label ORDER BY b.ord`);
  return {
    buckets: res.rows.map((x) => ({ label: x.bucket, count: x.count })),
    byCategory: await categoriesBreakdown(r),
  };
}

export async function categoriesBreakdown(r: Range): Promise<CategoryStat[]> {
  const res = await db.execute<{
    slug: string;
    name: string;
    color: string;
    total: number;
    open: number;
    avg_hours: number | null;
  }>(sql`
    SELECT c.slug, c.name, c.color,
           count(i.id)::int AS total,
           count(i.id) FILTER (WHERE i.status IN ('PENDING','IN_PROGRESS','REOPENED'))::int AS open,
           avg(extract(epoch FROM i.resolved_at - i.created_at) / 3600) FILTER (WHERE i.resolved_at IS NOT NULL) AS avg_hours
    FROM categories c
    LEFT JOIN issues i ON i.category_id = c.id AND ${issueWhere(r)}
    GROUP BY c.id HAVING count(i.id) > 0
    ORDER BY total DESC`);
  return res.rows.map((x) => ({
    slug: x.slug,
    name: x.name,
    color: x.color,
    total: x.total,
    open: x.open,
    avgResolutionHours: round1(x.avg_hours),
  }));
}

export async function wardsBreakdown(r: Range): Promise<WardStat[]> {
  const res = await db.execute<{
    id: string;
    code: string;
    name: string;
    total: number;
    open: number;
    resolved: number;
    median_hours: number | null;
    sla: number | null;
    reopen_rate: number | null;
  }>(sql`
    SELECT w.id, w.code, w.name,
      count(i.id)::int AS total,
      count(i.id) FILTER (WHERE i.status IN ('PENDING','IN_PROGRESS','REOPENED'))::int AS open,
      count(i.id) FILTER (WHERE i.status IN ('RESOLVED','VERIFIED'))::int AS resolved,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.resolved_at - i.created_at) / 3600)
        FILTER (WHERE i.resolved_at IS NOT NULL) AS median_hours,
      count(i.id) FILTER (WHERE i.resolved_at IS NOT NULL AND (i.sla_due_at IS NULL OR i.resolved_at <= i.sla_due_at))::float
        / nullif(count(i.id) FILTER (WHERE i.resolved_at IS NOT NULL), 0) AS sla,
      count(i.id) FILTER (WHERE i.reopened_count > 0)::float
        / nullif(count(i.id) FILTER (WHERE i.status IN ('RESOLVED','VERIFIED','REOPENED')), 0) AS reopen_rate
    FROM wards w
    LEFT JOIN issues i ON i.ward_id = w.id AND ${issueWhere({ ...r, wardId: undefined })}
    WHERE w.is_active ${r.wardId ? sql`AND w.id = ${r.wardId}` : sql``}
    GROUP BY w.id ORDER BY w.code`);
  return res.rows.map((x) => ({
    wardId: x.id,
    code: x.code,
    name: x.name,
    total: x.total,
    open: x.open,
    resolved: x.resolved,
    medianResolutionHours: round1(x.median_hours),
    slaCompliance: ratio(x.sla),
    reopenRate: ratio(x.reopen_rate) ?? 0,
  }));
}

export async function participation(r: Range): Promise<ParticipationPoint[]> {
  const res = await db.execute<{
    week: string;
    active: number;
    new_issues: number;
    joins: number;
    verifications: number;
  }>(sql`
    WITH weeks AS (
      SELECT generate_series(date_trunc('week', ${r.from}::timestamptz), ${r.to}::timestamptz, interval '1 week') AS week
    ),
    rep AS (
      SELECT date_trunc('week', r.created_at) AS week, r.reporter_id, r.source
      FROM reports r JOIN issues i ON i.id = r.issue_id
      WHERE ${issueWhere({ ...r, from: new Date(0) })} AND r.created_at >= ${r.from} AND r.created_at <= ${r.to}
    ),
    ver AS (
      SELECT date_trunc('week', vr.created_at) AS week, count(*) AS n
      FROM verification_responses vr
      JOIN verification_rounds rd ON rd.id = vr.round_id
      JOIN issues i ON i.id = rd.issue_id
      WHERE vr.response <> 'SKIPPED' AND vr.created_at >= ${r.from} AND vr.created_at <= ${r.to}
        ${r.wardId ? sql`AND i.ward_id = ${r.wardId}` : sql``}
      GROUP BY 1
    )
    SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
      (SELECT count(DISTINCT reporter_id) FROM rep WHERE rep.week = w.week)::int AS active,
      (SELECT count(*) FROM rep WHERE rep.week = w.week AND source = 'NEW')::int AS new_issues,
      (SELECT count(*) FROM rep WHERE rep.week = w.week AND source <> 'NEW')::int AS joins,
      coalesce((SELECT n FROM ver WHERE ver.week = w.week), 0)::int AS verifications
    FROM weeks w ORDER BY w.week`);
  return res.rows.map((x) => ({
    week: x.week,
    activeReporters: x.active,
    newIssues: x.new_issues,
    joins: x.joins,
    verifications: x.verifications,
  }));
}
