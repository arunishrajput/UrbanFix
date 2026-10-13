import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { GeoJsonBoundary, WardDTO } from '@urbanfix/shared';
import { config } from '../../config';
import { db } from '../../db/client';
import { getCategories } from '../../lib/categories';
import { getSettings } from '../../lib/settings';

export async function listWards(includeInactive = false): Promise<WardDTO[]> {
  const res = await db.execute<{
    id: string;
    code: string;
    name: string;
    is_active: boolean;
    center_lat: number | null;
    center_lng: number | null;
    boundary: string | null;
    open_issues: number;
  }>(sql`
    SELECT w.id, w.code, w.name, w.is_active, w.center_lat, w.center_lng,
           ST_AsGeoJSON(w.boundary, 6) AS boundary,
           (SELECT count(*)::int FROM issues i
             WHERE i.ward_id = w.id AND i.status IN ('PENDING','IN_PROGRESS','REOPENED') AND i.merged_into_id IS NULL) AS open_issues
    FROM wards w
    ${includeInactive ? sql`` : sql`WHERE w.is_active`}
    ORDER BY w.code`);
  return res.rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isActive: r.is_active,
    center: r.center_lat != null && r.center_lng != null ? { lat: r.center_lat, lng: r.center_lng } : null,
    boundary: r.boundary ? (JSON.parse(r.boundary) as GeoJsonBoundary) : null,
    openIssues: r.open_issues,
  }));
}

export const referenceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/categories', { schema: { tags: ['reference'] } }, async () =>
    (await getCategories()).filter((c) => c.isActive),
  );

  app.get('/wards', { schema: { tags: ['reference'] } }, () => listWards());

  /** City-wide numbers for the public home page. */
  app.get('/stats/public', { schema: { tags: ['reference'] } }, async () => {
    const res = await db.execute<{
      reported_30d: number;
      fixed_30d: number;
      verified_total: number;
      open_now: number;
      citizens_30d: number;
      joins_30d: number;
      reports_30d: number;
    }>(sql`
      SELECT
        (SELECT count(*)::int FROM issues WHERE merged_into_id IS NULL AND created_at >= now() - interval '30 days') AS reported_30d,
        (SELECT count(*)::int FROM issues WHERE resolved_at >= now() - interval '30 days' OR verified_at >= now() - interval '30 days') AS fixed_30d,
        (SELECT count(*)::int FROM issues WHERE status = 'VERIFIED') AS verified_total,
        (SELECT count(*)::int FROM issues WHERE merged_into_id IS NULL AND status IN ('PENDING','IN_PROGRESS','REOPENED')) AS open_now,
        (SELECT count(DISTINCT reporter_id)::int FROM reports WHERE created_at >= now() - interval '30 days') AS citizens_30d,
        (SELECT count(*)::int FROM reports WHERE source <> 'NEW' AND created_at >= now() - interval '30 days') AS joins_30d,
        (SELECT count(*)::int FROM reports WHERE created_at >= now() - interval '30 days') AS reports_30d`);
    const r = res.rows[0]!;
    return {
      reportedLast30Days: r.reported_30d,
      fixedLast30Days: r.fixed_30d,
      verifiedTotal: r.verified_total,
      openNow: r.open_now,
      activeCitizens: r.citizens_30d,
      duplicatesAvoided: r.joins_30d,
      joinRate: r.reports_30d ? Math.round((r.joins_30d / r.reports_30d) * 1000) / 1000 : 0,
    };
  });

  /** Public runtime configuration for the web app. */
  app.get('/config', { schema: { tags: ['reference'] } }, async () => {
    const settings = await getSettings();
    return {
      city: { name: config.CITY_NAME, center: { lat: config.CITY_LAT, lng: config.CITY_LNG } },
      aiEnabled: config.aiAvailable,
      pushPublicKey: config.pushAvailable ? config.VAPID_PUBLIC_KEY : null,
      verification: {
        windowHours: settings.windowHours,
        requireCompletionPhoto: settings.requireCompletionPhoto,
      },
      maxUploadMb: config.MAX_UPLOAD_MB,
    };
  });
};
