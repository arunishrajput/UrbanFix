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
