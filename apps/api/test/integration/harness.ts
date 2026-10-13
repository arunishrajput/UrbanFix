/**
 * Test harness: builds the app once per file, seeds a small fixture city and
 * exposes typed helpers for authenticated requests.
 */
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_CATEGORIES } from '@urbanfix/shared';
import { buildApp } from '../../src/app';
import { hashPassword } from '../../src/core/auth';
import { drainInlineJobs } from '../../src/core/jobs';
import { redis } from '../../src/core/redis';
import { db, pool, schema } from '../../src/db/client';
import { seedPhoto } from '../../src/db/seed-images';

export const PASSWORD = 'secret123';
export const CENTER = { lat: 18.52, lng: 73.85 };

/** Square ward boundary around a centre (± ~1.1 km). */
const square = (lat: number, lng: number) => ({
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [lng - 0.01, lat - 0.01],
        [lng + 0.01, lat - 0.01],
        [lng + 0.01, lat + 0.01],
        [lng - 0.01, lat + 0.01],
        [lng - 0.01, lat - 0.01],
      ],
    ],
  ],
});

export interface Fixture {
  app: FastifyInstance;
  wards: { a: string; b: string };
  token: (email: string) => Promise<string>;
  req: <T = unknown>(
    method: string,
    url: string,
    opts?: { token?: string; body?: unknown },
  ) => Promise<{ status: number; body: T }>;
  upload: (token: string, kind?: string, seed?: number) => Promise<{ id: string }>;
  close: () => Promise<void>;
}

export async function setupFixture(): Promise<Fixture> {
  await db.execute(
    sql`TRUNCATE users, wards, categories, issues, reports, photos, notifications, audit_logs, app_settings, geocode_cache RESTART IDENTITY CASCADE`,
  );
  await redis.flushdb();

  await db.insert(schema.categories).values(
    DEFAULT_CATEGORIES.map((c, i) => ({
      slug: c.slug,
      name: c.name,
      icon: c.icon,
      color: c.color,
      defaultPriority: c.defaultPriority,
      slaHours: c.slaHours,
      duplicateRadiusM: c.duplicateRadiusM,
      relatedSlugs: c.relatedSlugs,
      sortOrder: i,
    })),
  );
  const [wardA] = await db
    .insert(schema.wards)
    .values({
      code: 'A',
      name: 'Ward A',
      centerLat: CENTER.lat,
      centerLng: CENTER.lng,
      boundary: sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(square(CENTER.lat, CENTER.lng))}), 4326)`,
    })
    .returning();
  const [wardB] = await db
    .insert(schema.wards)
    .values({
      code: 'B',
      name: 'Ward B',
      centerLat: CENTER.lat + 0.05,
      centerLng: CENTER.lng,
      boundary: sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(square(CENTER.lat + 0.05, CENTER.lng))}), 4326)`,
    })
    .returning();

  const passwordHash = await hashPassword(PASSWORD);
  const u = (
    email: string,
    role: 'CITIZEN' | 'STAFF' | 'OFFICIAL' | 'ADMIN',
    wardId: string | null = null,
  ) => ({
    email,
    name: email.split('@')[0]!.replace('.', ' '),
    role,
    wardId,
    passwordHash,
  });
  await db
    .insert(schema.users)
    .values([
      u('admin@test.local', 'ADMIN'),
      u('official.a@test.local', 'OFFICIAL', wardA!.id),
      u('official.b@test.local', 'OFFICIAL', wardB!.id),
      u('staff.a@test.local', 'STAFF', wardA!.id),
      u('alice@test.local', 'CITIZEN'),
      u('bob@test.local', 'CITIZEN'),
      u('carol@test.local', 'CITIZEN'),
    ]);

  const app = await buildApp();
  await app.ready();
  const tokens = new Map<string, string>();

  const req: Fixture['req'] = async (method, url, opts = {}) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: {
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        'x-requested-with': 'urbanfix',
      },
      ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
    });
    await drainInlineJobs();
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
  };

  const token = async (email: string) => {
    const cached = tokens.get(email);
    if (cached) return cached;
    const res = await req<{ accessToken: string }>('POST', '/api/v1/auth/login', {
      body: { email, password: PASSWORD },
    });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
    tokens.set(email, res.body.accessToken);
    return res.body.accessToken;
  };

  let photoSeed = 1;
  const upload: Fixture['upload'] = async (tok, kind = 'REPORT', seed) => {
    let s = seed ?? photoSeed++ * 7919;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const image = await seedPhoto('garbage', rand);
    const boundary = '----uf' + Math.random().toString(16).slice(2);
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/uploads?kind=${kind}`,
      headers: {
        authorization: `Bearer ${tok}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    await drainInlineJobs();
    if (res.statusCode !== 201) throw new Error(`upload failed: ${res.body}`);
    return JSON.parse(res.body) as { id: string };
  };

  return {
    app,
    wards: { a: wardA!.id, b: wardB!.id },
    token,
    req,
    upload,
    close: async () => {
      await drainInlineJobs();
      await app.close();
    },
  };
}

export async function teardown() {
  await pool.end();
  redis.disconnect();
}
