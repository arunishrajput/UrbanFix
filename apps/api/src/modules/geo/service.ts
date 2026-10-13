import { eq, sql } from 'drizzle-orm';
import { config } from '../../config';
import { logger } from '../../core/logger';
import { redis, redisKeys } from '../../core/redis';
import { type DbOrTx, db, schema } from '../../db/client';

export interface GeocodeResult {
  address: string;
  components: Record<string, string>;
}

const cacheKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reverse geocodes through Nominatim (or any compatible service).
 * Cached for ~11 m cells in Redis and Postgres, and throttled to one upstream
 * request per second across all API replicas, per the Nominatim usage policy.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const key = cacheKey(lat, lng);
  const cached = await redis.get(redisKeys.geocode(key));
  if (cached) return JSON.parse(cached) as GeocodeResult;

  const [row] = await db.select().from(schema.geocodeCache).where(eq(schema.geocodeCache.key, key));
  if (row) {
    await redis.set(redisKeys.geocode(key), JSON.stringify(row.result), 'EX', 86_400);
    return row.result;
  }

  for (let i = 0; i < 4; i++) {
    const acquired = await redis.set(redisKeys.geocodeThrottle, '1', 'PX', 1100, 'NX');
    if (acquired) break;
    if (i === 3) return null;
    await sleep(400);
  }

  try {
    const url = new URL('/reverse', config.GEOCODER_URL);
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      zoom: '18',
      addressdetails: '1',
      ...(config.GEOCODER_EMAIL ? { email: config.GEOCODER_EMAIL } : {}),
    }).toString();
    const res = await fetch(url, {
      headers: { 'user-agent': config.GEOCODER_USER_AGENT, 'accept-language': 'en' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`geocoder responded ${res.status}`);
    const json = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    if (!json.display_name) return null;
    const result: GeocodeResult = {
      address: shortAddress(json.address ?? {}, json.display_name),
      components: json.address ?? {},
    };
    await db.insert(schema.geocodeCache).values({ key, result }).onConflictDoNothing();
    await redis.set(redisKeys.geocode(key), JSON.stringify(result), 'EX', 86_400);
    return result;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'reverse geocoding failed');
    return null;
  }
}

/** "12, MG Road, Shivajinagar, Pune" rather than the full display name. */
export function shortAddress(a: Record<string, string>, fallback: string): string {
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway].filter(Boolean).join(', ');
  const area = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.residential;
  const city = a.city ?? a.town ?? a.village ?? a.county;
  const parts = [street || a.amenity || a.building, area, city].filter(Boolean);
  return parts.length >= 2 ? parts.join(', ') : fallback.split(',').slice(0, 4).join(',').trim();
}

/** The ward containing the point, or the nearest ward centre within 10 km. */
export async function findWardId(dbx: DbOrTx, lat: number, lng: number): Promise<string | null> {
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
  const contains = await dbx.execute<{ id: string }>(
    sql`SELECT id FROM wards WHERE is_active AND boundary IS NOT NULL AND ST_Contains(boundary, ${point}) LIMIT 1`,
  );
  if (contains.rows[0]) return contains.rows[0].id;
  const nearest = await dbx.execute<{ id: string }>(sql`
    SELECT id FROM wards
    WHERE is_active AND center_lat IS NOT NULL
      AND ST_DWithin(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, ${point}::geography, 10000)
    ORDER BY ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography <-> ${point}::geography
    LIMIT 1`);
  return nearest.rows[0]?.id ?? null;
}
