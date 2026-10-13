/**
 * Seeds a demo city: wards (Voronoi cells around real Pune localities),
 * categories, officials, staff, citizens and ~160 issues with photos,
 * joins, timelines and verification rounds. Deterministic (seeded PRNG).
 *
 *   pnpm db:seed           # only when the database is empty
 *   pnpm db:seed --force   # seed anyway (use db:reset for a clean slate)
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  DEFAULT_CATEGORIES,
  REPUTATION,
  computePriority,
  earnedBadgeCodes,
  type IssueStatus,
  type PhotoAnalysis,
  type Priority,
} from '@urbanfix/shared';
import { config } from '../config';
import { hashPassword } from '../core/auth';
import { logger } from '../core/logger';
import { redis } from '../core/redis';
import { storage } from '../core/storage';
import { processImage } from '../lib/images';
import { contributionStats } from '../modules/gamification/service';
import { findWardId } from '../modules/geo/service';
import { db, pool, schema } from './client';
import { fixedPhoto, reshoot, seedPhoto, type Rand } from './seed-images';

/* ---------- deterministic randomness ---------- */

function mulberry32(seed: number): Rand {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = mulberry32(20261013);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const int = (a: number, b: number) => Math.floor(a + r() * (b - a + 1));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

export const DEMO_PASSWORD = 'urbanfix123';

/* ---------- reference data ---------- */

const PUNE_WARDS = [
  { code: 'W01', name: 'Aundh', lat: 18.5603, lng: 73.8077 },
  { code: 'W02', name: 'Shivajinagar', lat: 18.5308, lng: 73.8475 },
  { code: 'W03', name: 'Yerawada', lat: 18.5529, lng: 73.8863 },
  { code: 'W04', name: 'Kothrud', lat: 18.5074, lng: 73.8077 },
  { code: 'W05', name: 'Kasba Peth', lat: 18.5195, lng: 73.8553 },
  { code: 'W06', name: 'Camp', lat: 18.5158, lng: 73.8786 },
  { code: 'W07', name: 'Swargate', lat: 18.5018, lng: 73.8636 },
  { code: 'W08', name: 'Hadapsar', lat: 18.5089, lng: 73.926 },
];

function wardSeeds() {
  if (config.CITY_NAME.toLowerCase() === 'pune') return PUNE_WARDS;
  // Any other city: eight wards in a ring around the configured centre.
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 2 * Math.PI;
    return {
      code: `W${String(i + 1).padStart(2, '0')}`,
      name: `Ward ${i + 1}`,
      lat: config.CITY_LAT + 0.025 * Math.sin(angle),
      lng: config.CITY_LNG + 0.03 * Math.cos(angle),
    };
  });
}

const ROADS = [
  'FC Road',
  'JM Road',
  'Karve Road',
  'Baner Road',
  'Law College Road',
  'MG Road',
  'Sinhagad Road',
  'Nagar Road',
  'Solapur Road',
  'Paud Road',
  'Station Road',
  'Laxmi Road',
  'Tilak Road',
  'Bajirao Road',
  'University Road',
  'Senapati Bapat Road',
  'Ganeshkhind Road',
  'Prabhat Road',
  'Bhandarkar Road',
  'East Street',
];

const TITLES: Record<string, string[]> = {
  garbage: [
    'Overflowing garbage bin on footpath',
    'Uncollected garbage pile near bus stop',
    'Garbage dumped next to community bin',
    'Waste spilling onto the road',
  ],
  'road-pothole': [
    'Deep pothole in the middle of the road',
    'Cluster of potholes near junction',
    'Large pothole filled with rainwater',
    'Broken road surface near speed breaker',
  ],
  'broken-drain': [
    'Open drain with broken cover',
    'Clogged drain overflowing onto street',
    'Missing manhole cover',
    'Blocked storm drain causing waterlogging',
  ],
  'water-leakage': [
    'Water leaking from roadside valve',
    'Continuous water leakage from pipe joint',
    'Public tap leaking non-stop',
    'Water flowing across the road from leak',
  ],
  'broken-pipeline': [
    'Burst water pipeline spraying water',
    'Damaged supply line exposed in trench',
    'Broken pipeline flooding the lane',
  ],
  'street-light': [
    'Street light not working',
    'Flickering street light at corner',
    'Row of street lights off at night',
    'Damaged street light pole',
  ],
  'illegal-dumping': [
    'Construction debris dumped on roadside',
    'Illegal dumping in vacant plot',
    'Old furniture and waste dumped near wall',
  ],
  'tree-fallen': [
    'Fallen tree blocking the road',
    'Large branch hanging over footpath',
    'Uprooted tree after rain',
  ],
  'damaged-footpath': [
    'Broken paver blocks on footpath',
    'Footpath slabs missing near shops',
    'Uneven, damaged footpath',
  ],
  'traffic-signal': [
    'Traffic signal not working at junction',
    'Signal stuck on red',
    'Damaged traffic signal head',
  ],
  others: ['Damaged public bench', 'Stray cattle obstructing traffic', 'Broken railing on bridge'],
};

const DESCRIPTIONS: Record<string, string[]> = {
  garbage: [
    'Bin has not been cleared for three days and it smells terrible.',
    'Dogs are spreading the waste across the footpath.',
  ],
  'road-pothole': [
    'Two-wheelers are swerving to avoid it, very dangerous at night.',
    'Has been getting bigger after every rain.',
  ],
  'broken-drain': [
    'Water backs up onto the street whenever it rains.',
    'Children walk past here to school, the open drain is risky.',
  ],
  'water-leakage': [
    'Clean water is being wasted since yesterday morning.',
    'Leak is getting worse, road surface is getting damaged.',
  ],
  'broken-pipeline': [
    'Supply to the whole lane is affected.',
    'Water pressure in our building dropped since this started.',
  ],
  'street-light': [
    'The stretch is completely dark after 8 pm, women feel unsafe.',
    'Light has been off for over a week.',
  ],
  'illegal-dumping': [
    'A truck dumped this overnight.',
    'Debris is spilling onto the road and blocking parking.',
  ],
  'tree-fallen': ['Blocking one full lane of traffic.', 'Branch is resting on electric wires.'],
  'damaged-footpath': ['Senior citizens have tripped here.', 'Impossible to walk with a stroller.'],
  'traffic-signal': [
    'Traffic jam builds up every evening because of this.',
    'Signal has been blinking yellow since morning.',
  ],
  others: ['Needs attention from the corporation.'],
};

const CATEGORY_WEIGHTS: [string, number][] = [
  ['garbage', 22],
  ['road-pothole', 18],
  ['street-light', 12],
  ['broken-drain', 10],
  ['water-leakage', 8],
  ['illegal-dumping', 8],
  ['damaged-footpath', 7],
  ['tree-fallen', 4],
  ['traffic-signal', 4],
  ['broken-pipeline', 3],
  ['others', 4],
];
function weightedCategory() {
  const total = CATEGORY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [slug, w] of CATEGORY_WEIGHTS) if ((x -= w) <= 0) return slug;
  return 'others';
}

const CITIZEN_NAMES = [
  'Priya Sharma',
  'Aarav Mehta',
  'Sneha Kulkarni',
  'Rohan Gupta',
  'Ananya Iyer',
  'Kabir Singh',
  'Ishita Rao',
  'Arjun Nair',
  'Pooja Patil',
  'Siddharth Joshi',
  'Neha Deshpande',
  'Aditya Bhosale',
  'Kavya Reddy',
  'Omkar Jadhav',
  'Riya Kapoor',
  'Varun Shinde',
  'Tanvi Gokhale',
  'Nikhil Chavan',
  'Aditi Pawar',
  'Harsh Agarwal',
  'Shruti More',
  'Yash Kale',
  'Meghna Bapat',
  'Pranav Apte',
  'Zoya Shaikh',
];

/* ---------- helpers ---------- */

async function storePhoto(
  buffer: Buffer,
  uploadedById: string,
  kind: 'REPORT' | 'WORK_COMPLETION' | 'VERIFICATION',
) {
  const img = await processImage(buffer);
  const id = randomUUID();
  const prefix = `photos/seed/${id}`;
  const variants = {
    thumb: `${prefix}/thumb.webp`,
    medium: `${prefix}/medium.webp`,
    full: `${prefix}/full.webp`,
  };
  await Promise.all([
    storage.put(variants.thumb, img.variants.thumb, 'image/webp'),
    storage.put(variants.medium, img.variants.medium, 'image/webp'),
    storage.put(variants.full, img.variants.full, 'image/webp'),
  ]);
  return {
    id,
    uploadedById,
    kind,
    status: 'ATTACHED' as const,
    variants,
    width: img.width,
    height: img.height,
    bytes: img.variants.full.length,
    thumbhash: img.thumbhash,
    sha256: img.sha256,
    phash: img.phash,
    analysisStatus: 'SKIPPED' as const,
  };
}

function seedAnalysis(slug: string, title: string, severity: number, priority: Priority): PhotoAnalysis {
  return {
    categorySlug: slug,
    confidence: 0.9,
    alternatives: [],
    caption: title,
    descriptionSuggestion: null,
    severity,
    severityReason: 'Seed data',
    suggestedPriority: priority,
    moderation: { safe: true, flags: [], reason: null },
    ocrText: null,
    isCivicIssue: true,
    source: 'heuristic',
    model: null,
  };
}

function jitter(lat: number, lng: number, metres: number) {
  const angle = r() * 2 * Math.PI;
  const dist = Math.sqrt(r()) * metres;
  return {
    lat: lat + (dist * Math.sin(angle)) / 111_320,
    lng: lng + (dist * Math.cos(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180)),
  };
}

/* ---------- main ---------- */

async function seed() {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users);
  if (count > 0 && !process.argv.includes('--force')) {
    logger.info('database already has data; skipping seed (use `pnpm db:reset` for a fresh demo)');
    return;
  }
  const started = Date.now();

  /* categories */
  const categoryRows = await db
    .insert(schema.categories)
    .values(
      DEFAULT_CATEGORIES.map((c, i) => ({
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        color: c.color,
        description: c.description,
        defaultPriority: c.defaultPriority,
        slaHours: c.slaHours,
        duplicateRadiusM: c.duplicateRadiusM,
        relatedSlugs: c.relatedSlugs,
        sortOrder: (i + 1) * 10,
      })),
    )
    .onConflictDoNothing()
    .returning();
  const categories = categoryRows.length ? categoryRows : await db.select().from(schema.categories);
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));

  /* wards: Voronoi cells around each locality, clipped to the city envelope */
  const seeds = wardSeeds();
  await db
    .insert(schema.wards)
    .values(seeds.map((w) => ({ code: w.code, name: w.name, centerLat: w.lat, centerLng: w.lng })));
  const lats = seeds.map((w) => w.lat);
  const lngs = seeds.map((w) => w.lng);
  await db.execute(sql`
    WITH env AS (SELECT ST_MakeEnvelope(${Math.min(...lngs) - 0.035}, ${Math.min(...lats) - 0.03},
                                        ${Math.max(...lngs) + 0.035}, ${Math.max(...lats) + 0.03}, 4326) AS e),
    cells AS (
      SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)), 0, (SELECT e FROM env)))).geom AS g
      FROM wards
    )
    UPDATE wards w SET boundary = ST_Multi(ST_Intersection(ST_SetSRID(c.g, 4326), (SELECT e FROM env)))
    FROM cells c
    WHERE ST_Contains(ST_SetSRID(c.g, 4326), ST_SetSRID(ST_MakePoint(w.center_lng, w.center_lat), 4326))`);
  const wards = await db.select().from(schema.wards);
  const wardByCode = new Map(wards.map((w) => [w.code, w]));

  /* users */
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const mk = (
    name: string,
    email: string,
    role: 'CITIZEN' | 'STAFF' | 'OFFICIAL' | 'ADMIN',
    wardCode?: string,
    createdDaysAgo = int(60, 200),
  ) => ({
    name,
    email,
    role,
    passwordHash,
    wardId: wardCode ? wardByCode.get(wardCode)!.id : null,
    phone: `+91 98${int(10000000, 99999999)}`,
    createdAt: new Date(NOW - createdDaysAgo * DAY),
  });
  const staffSeeds = [
    mk('Asha Kulkarni', 'admin@urbanfix.local', 'ADMIN'),
    mk('Rahul Deshmukh', 'official@urbanfix.local', 'OFFICIAL'),
    mk('Meera Joshi', 'official.kothrud@urbanfix.local', 'OFFICIAL', 'W04'),
    mk('Vikram Patil', 'official.shivajinagar@urbanfix.local', 'OFFICIAL', 'W02'),
    mk('Sanjay Pawar', 'staff@urbanfix.local', 'STAFF', 'W02'),
    mk('Deepa Naik', 'staff.kothrud@urbanfix.local', 'STAFF', 'W04'),
    mk('Imran Khan', 'staff.camp@urbanfix.local', 'STAFF', 'W06'),
    mk('Lata Gaikwad', 'staff.aundh@urbanfix.local', 'STAFF', 'W01'),
    mk('Ganesh Mane', 'staff.hadapsar@urbanfix.local', 'STAFF', 'W08'),
    mk('Suresh Waghmare', 'staff.central@urbanfix.local', 'STAFF'),
  ];
  const citizenSeeds = CITIZEN_NAMES.map((name, i) =>
    mk(
      name,
      i === 0 ? 'citizen@urbanfix.local' : `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      'CITIZEN',
    ),
  );
  const inserted = await db
    .insert(schema.users)
    .values([...staffSeeds, ...citizenSeeds])
    .returning();
  const byEmail = new Map(inserted.map((u) => [u.email!, u]));
  const citizens = inserted.filter((u) => u.role === 'CITIZEN');
  const demoCitizen = byEmail.get('citizen@urbanfix.local')!;
  const staff = inserted.filter((u) => u.role === 'STAFF');
  const officials = inserted.filter((u) => u.role === 'OFFICIAL');
  const officialFor = (wardId: string | null) =>
    officials.find((o) => o.wardId === wardId) ?? officials.find((o) => !o.wardId)!;
  const staffFor = (wardId: string | null) => {
    const local = staff.filter((s) => s.wardId === wardId);
    return local.length ? pick(local) : staff.find((s) => !s.wardId)!;
  };

  /* issues */
  type Plan = {
    slug: string;
    lat: number;
    lng: number;
    createdAt: Date;
    status: IssueStatus;
    creatorId: string;
    joiners: number;
    supporters: number;
    severity: number;
    pinned?: boolean;
  };
  const plans: Plan[] = [];

  // Pinned demo issues used by the README walkthrough and e2e test.
  plans.push({
    slug: 'garbage',
    lat: 18.52305,
    lng: 73.84125,
    createdAt: new Date(NOW - 2 * DAY),
    status: 'PENDING',
    creatorId: citizens[3]!.id,
    joiners: 2,
    supporters: 4,
    severity: 3,
    pinned: true,
  });
  plans.push({
    slug: 'road-pothole',
    lat: 18.50745,
    lng: 73.80695,
    createdAt: new Date(NOW - 6 * DAY),
    status: 'RESOLVED',
    creatorId: demoCitizen.id,
    joiners: 1,
    supporters: 3,
    severity: 4,
    pinned: true,
  });
  plans.push({
    slug: 'street-light',
    lat: 18.5362,
    lng: 73.8902,
    createdAt: new Date(NOW - 12 * DAY),
    status: 'IN_PROGRESS',
    creatorId: demoCitizen.id,
    joiners: 3,
    supporters: 8,
    severity: 3,
    pinned: true,
  });

  for (let i = 0; i < 160; i++) {
    const ward = pick(seeds);
    const { lat, lng } = jitter(ward.lat, ward.lng, 1400);
    const ageDays = Math.pow(r(), 1.4) * 90;
    const createdAt = new Date(NOW - ageDays * DAY - int(0, 23) * HOUR);
    const x = r();
    let status: IssueStatus;
    if (ageDays < 3) status = x < 0.7 ? 'PENDING' : x < 0.95 ? 'IN_PROGRESS' : 'REJECTED';
    else if (ageDays < 14)
      status =
        x < 0.3
          ? 'PENDING'
          : x < 0.55
            ? 'IN_PROGRESS'
            : x < 0.75
              ? 'RESOLVED'
              : x < 0.9
                ? 'VERIFIED'
                : x < 0.95
                  ? 'REOPENED'
                  : 'REJECTED';
    else
      status =
        x < 0.12
          ? 'PENDING'
          : x < 0.22
            ? 'IN_PROGRESS'
            : x < 0.27
              ? 'RESOLVED'
              : x < 0.88
                ? 'VERIFIED'
                : x < 0.94
                  ? 'REOPENED'
                  : 'REJECTED';
    plans.push({
      slug: weightedCategory(),
      lat,
      lng,
      createdAt,
      status,
      creatorId: i % 9 === 0 ? demoCitizen.id : pick(citizens).id,
      joiners: Math.floor(Math.pow(r(), 2) * 5),
      supporters: Math.floor(Math.pow(r(), 2.5) * 22),
      severity: int(2, 5),
    });
  }

  const reputation = new Map<string, number>();
  const repEvents: (typeof schema.reputationEvents.$inferInsert)[] = [];
  const award = (userId: string, reason: keyof typeof REPUTATION, refId: string, at: Date) => {
    repEvents.push({ userId, delta: REPUTATION[reason], reason, refId, createdAt: at });
    reputation.set(userId, (reputation.get(userId) ?? 0) + REPUTATION[reason]);
  };
  const notifications: (typeof schema.notifications.$inferInsert)[] = [];

  let n = 0;
  for (const plan of plans) {
    const cat = catBySlug.get(plan.slug)!;
    const wardId = await findWardId(db, plan.lat, plan.lng);
    const ward = wards.find((w) => w.id === wardId);
    const title = pick(TITLES[plan.slug] ?? TITLES.others!);
    const description = r() < 0.6 ? pick(DESCRIPTIONS[plan.slug] ?? DESCRIPTIONS.others!) : null;
    const address = `${int(1, 220)}, ${pick(ROADS)}, ${ward?.name ?? 'Central'}, ${config.CITY_NAME}`;
    const reopened = plan.status === 'REOPENED' ? 1 : 0;
    const otherCitizens = citizens.filter((c) => c.id !== plan.creatorId);
    const joiners = [...otherCitizens].sort(() => r() - 0.5).slice(0, plan.joiners);
    const extraSupporters = [...otherCitizens.filter((c) => !joiners.includes(c))]
      .sort(() => r() - 0.5)
      .slice(0, plan.supporters);
    const supportCount = 1 + joiners.length + extraSupporters.length;
    const { priority } = computePriority({
      categoryDefault: cat.defaultPriority,
      severity: plan.severity,
      supportCount,
      reopenedCount: reopened,
    });
    const assignee = plan.status === 'PENDING' || plan.status === 'REJECTED' ? null : staffFor(wardId);
    const official = officialFor(wardId);

    // Timeline anchors
    const t0 = plan.createdAt.getTime();
    const assignedAt = new Date(t0 + int(2, 30) * HOUR);
    const startedAt = new Date(assignedAt.getTime() + int(1, 24) * HOUR);
    let resolvedAt: Date | null = null;
    if (['RESOLVED', 'VERIFIED', 'REOPENED'].includes(plan.status)) {
      resolvedAt =
        plan.status === 'RESOLVED'
          ? new Date(Math.max(startedAt.getTime() + HOUR, NOW - int(2, 60) * HOUR))
          : new Date(Math.min(NOW - 4 * DAY, startedAt.getTime() + int(4, 24 * 9) * HOUR));
      if (resolvedAt.getTime() <= startedAt.getTime())
        resolvedAt = new Date(startedAt.getTime() + int(2, 12) * HOUR);
    }
    const verifiedAt =
      plan.status === 'VERIFIED' && resolvedAt ? new Date(resolvedAt.getTime() + int(6, 60) * HOUR) : null;
    const lastActivity = new Date(
      Math.min(
        NOW,
        Math.max(t0, verifiedAt?.getTime() ?? resolvedAt?.getTime() ?? (assignee ? startedAt.getTime() : t0)),
      ),
    );

    const issueId = randomUUID();
    const baseImage = await seedPhoto(plan.slug, r);
    const creatorPhoto = await storePhoto(baseImage, plan.creatorId, 'REPORT');
    const reportId = randomUUID();

    await db.insert(schema.issues).values({
      id: issueId,
      categoryId: cat.id,
      wardId,
      status: plan.status,
      priority,
      severity: plan.severity,
      title,
      description,
      lat: plan.lat,
      lng: plan.lng,
      address,
      supportCount,
      reportCount: 1 + joiners.length,
      reporterCount: 1 + joiners.length,
      assigneeId: assignee?.id ?? null,
      createdById: plan.creatorId,
      coverPhotoId: creatorPhoto.id,
      reopenedCount: reopened,
      slaDueAt: new Date(t0 + cat.slaHours * HOUR),
      resolvedAt: plan.status === 'REOPENED' ? null : resolvedAt,
      verifiedAt,
      lastActivityAt: lastActivity,
      createdAt: plan.createdAt,
      updatedAt: lastActivity,
    });
    await db.insert(schema.reports).values({
      id: reportId,
      issueId,
      reporterId: plan.creatorId,
      source: 'NEW',
      description,
      lat: plan.lat,
      lng: plan.lng,
      accuracyM: int(4, 20),
      address,
      ai: seedAnalysis(plan.slug, title, plan.severity, priority),
      moderationStatus: 'APPROVED',
      createdAt: plan.createdAt,
    });
    const photoRows: (typeof schema.photos.$inferInsert)[] = [
      { ...creatorPhoto, issueId, reportId, createdAt: plan.createdAt },
    ];
    const events: (typeof schema.issueEvents.$inferInsert)[] = [
      {
        issueId,
        actorId: plan.creatorId,
        type: 'CREATED',
        toStatus: 'PENDING',
        payload: { photoCount: 1 },
        createdAt: plan.createdAt,
      },
    ];
    const supporterRows: (typeof schema.issueSupporters.$inferInsert)[] = [
      { issueId, userId: plan.creatorId, isReporter: true, createdAt: plan.createdAt },
    ];
    award(plan.creatorId, 'REPORT_CREATED', reportId, plan.createdAt);
    notifications.push({
      userId: plan.creatorId,
      type: 'ISSUE_SUBMITTED',
      title: 'Report received',
      body: `Thanks! Your ${cat.name.toLowerCase()} report has been sent to the municipal corporation.`,
      issueId,
      createdAt: plan.createdAt,
      readAt: plan.createdAt.getTime() < NOW - 3 * DAY ? plan.createdAt : null,
    });

    for (const [k, joiner] of joiners.entries()) {
      // Joins happen while the issue is still open (before it was resolved).
      const latest = (resolvedAt?.getTime() ?? NOW) - HOUR;
      const at = new Date(Math.max(t0 + 30 * 60_000, Math.min(latest, t0 + (k + 1) * int(3, 30) * HOUR)));
      const jReport = randomUUID();
      const near = jitter(plan.lat, plan.lng, 15);
      await db.insert(schema.reports).values({
        id: jReport,
        issueId,
        reporterId: joiner.id,
        source: 'JOINED',
        description: r() < 0.4 ? 'Same problem here, still not fixed.' : null,
        lat: near.lat,
        lng: near.lng,
        accuracyM: int(4, 25),
        ai: seedAnalysis(plan.slug, title, plan.severity, priority),
        moderationStatus: 'APPROVED',
        createdAt: at,
      });
      if (r() < 0.6) {
        const p = await storePhoto(await reshoot(baseImage, r), joiner.id, 'REPORT');
        photoRows.push({ ...p, issueId, reportId: jReport, createdAt: at });
      }
      supporterRows.push({ issueId, userId: joiner.id, isReporter: true, createdAt: at });
      events.push({
        issueId,
        actorId: joiner.id,
        type: 'REPORT_JOINED',
        payload: { reportId: jReport, reporterCount: k + 2 },
        createdAt: at,
      });
      award(joiner.id, 'REPORT_JOINED', jReport, at);
    }
    for (const s of extraSupporters) {
      supporterRows.push({
        issueId,
        userId: s.id,
        isReporter: false,
        createdAt: new Date(t0 + int(1, 72) * HOUR),
      });
    }

    if (assignee) {
      events.push({
        issueId,
        actorId: official.id,
        type: 'ASSIGNED',
        payload: { assigneeId: assignee.id, assigneeName: assignee.name },
        createdAt: assignedAt,
      });
      events.push({
        issueId,
        actorId: assignee.id,
        type: 'STATUS_CHANGED',
        fromStatus: 'PENDING',
        toStatus: 'IN_PROGRESS',
        body: 'Crew dispatched to site.',
        createdAt: startedAt,
      });
      if (r() < 0.5) {
        events.push({
          issueId,
          actorId: official.id,
          type: 'NOTE_ADDED',
          body: pick([
            'Contractor informed, materials arriving tomorrow.',
            'Needs coordination with water department.',
            'Checked on site — confirmed.',
          ]),
          isInternal: true,
          createdAt: new Date(startedAt.getTime() + HOUR),
        });
      }
    }
    if (plan.status === 'REJECTED') {
      events.push({
        issueId,
        actorId: official.id,
        type: 'STATUS_CHANGED',
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
        body: pick([
          'Private property — outside corporation jurisdiction.',
          'Duplicate of an existing complaint.',
          'Not a civic issue.',
        ]),
        createdAt: new Date(t0 + int(3, 30) * HOUR),
      });
    }

    const reporterIds = [plan.creatorId, ...joiners.map((j) => j.id)];
    if (resolvedAt && assignee) {
      const work = await storePhoto(await fixedPhoto(plan.slug, r), assignee.id, 'WORK_COMPLETION');
      photoRows.push({ ...work, issueId, reportId: null, createdAt: resolvedAt });
      events.push({
        issueId,
        actorId: assignee.id,
        type: 'WORK_PHOTOS_ADDED',
        body: 'Work completed.',
        payload: { count: 1 },
        createdAt: new Date(resolvedAt.getTime() - 10 * 60_000),
      });
      events.push({
        issueId,
        actorId: assignee.id,
        type: 'STATUS_CHANGED',
        fromStatus: 'IN_PROGRESS',
        toStatus: 'RESOLVED',
        createdAt: resolvedAt,
      });

      const roundId = randomUUID();
      const closesAt = new Date(resolvedAt.getTime() + 72 * HOUR);
      const outcome =
        plan.status === 'RESOLVED' ? 'PENDING' : plan.status === 'VERIFIED' ? 'VERIFIED' : 'REOPENED';
      const closedAt =
        outcome === 'PENDING' ? null : (verifiedAt ?? new Date(resolvedAt.getTime() + int(4, 40) * HOUR));
      await db.insert(schema.verificationRounds).values({
        id: roundId,
        issueId,
        roundNo: 1,
        openedAt: resolvedAt,
        closesAt,
        closedAt,
        outcome,
        eligibleCount: reporterIds.length,
        openedById: assignee.id,
      });
      events.push({
        issueId,
        actorId: null,
        type: 'VERIFICATION_REQUESTED',
        payload: { roundId, roundNo: 1, eligible: reporterIds.length },
        createdAt: resolvedAt,
      });
      for (const rid of reporterIds) {
        notifications.push({
          userId: rid,
          type: 'VERIFICATION_REQUEST',
          title: 'Is it fixed? Please confirm',
          body: `${title} was marked resolved. Tell us if the problem is really gone.`,
          issueId,
          data: { roundId, action: 'verify' },
          createdAt: resolvedAt,
          readAt: outcome === 'PENDING' ? null : closedAt,
        });
      }
      if (outcome === 'VERIFIED') {
        const confirmers = reporterIds.slice(0, Math.max(1, Math.min(reporterIds.length, 2 + int(0, 1))));
        for (const [k, uid] of confirmers.entries()) {
          const at = new Date(resolvedAt.getTime() + (k + 1) * HOUR * int(1, 12));
          await db
            .insert(schema.verificationResponses)
            .values({ roundId, userId: uid, response: 'RESOLVED', createdAt: at });
          events.push({
            issueId,
            actorId: uid,
            type: 'VERIFICATION_RESPONSE',
            payload: { response: 'RESOLVED', roundId },
            createdAt: at,
          });
          award(uid, 'VERIFICATION_RESPONSE', roundId, at);
        }
        events.push({
          issueId,
          actorId: null,
          type: 'VERIFIED',
          fromStatus: 'RESOLVED',
          toStatus: 'VERIFIED',
          payload: { roundId },
          createdAt: verifiedAt!,
        });
        for (const uid of reporterIds) award(uid, 'ISSUE_VERIFIED', issueId, verifiedAt!);
      } else if (outcome === 'REOPENED') {
        const uid = pick(reporterIds);
        const at = closedAt!;
        const evidence = await storePhoto(await reshoot(baseImage, r), uid, 'VERIFICATION');
        photoRows.push({ ...evidence, issueId, reportId: null, createdAt: at });
        await db.insert(schema.verificationResponses).values({
          roundId,
          userId: uid,
          response: 'NOT_FIXED',
          comment: 'Still exactly the same as before.',
          photoIds: [evidence.id],
          createdAt: at,
        });
        events.push({
          issueId,
          actorId: uid,
          type: 'VERIFICATION_RESPONSE',
          body: 'Still exactly the same as before.',
          payload: { response: 'NOT_FIXED', roundId },
          createdAt: at,
        });
        events.push({
          issueId,
          actorId: uid,
          type: 'REOPENED',
          fromStatus: 'RESOLVED',
          toStatus: 'REOPENED',
          body: 'Still exactly the same as before.',
          payload: { by: 'citizen', roundId },
          createdAt: new Date(at.getTime() + 1000),
        });
        award(uid, 'VERIFICATION_RESPONSE', roundId, at);
      }
    }

    if (plan.status === 'PENDING' && t0 > NOW - 4 * DAY) {
      notifications.push({
        userId: official.id,
        type: 'ISSUE_NEW_IN_WARD',
        title: `New ${cat.name} issue`,
        body: `Reported at ${address}`,
        issueId,
        data: { priority },
        createdAt: plan.createdAt,
      });
    }

    await db.insert(schema.photos).values(photoRows);
    await db.insert(schema.issueSupporters).values(supporterRows).onConflictDoNothing();
    await db.insert(schema.issueEvents).values(events);
    n++;
    if (n % 25 === 0) logger.info({ issues: n }, 'seeding…');
  }

  if (repEvents.length) {
    for (let i = 0; i < repEvents.length; i += 500) {
      await db
        .insert(schema.reputationEvents)
        .values(repEvents.slice(i, i + 500))
        .onConflictDoNothing();
    }
  }
  for (const [userId, rep] of reputation) {
    await db
      .update(schema.users)
      .set({ reputation: rep })
      .where(sql`id = ${userId}`);
  }
  for (let i = 0; i < notifications.length; i += 500) {
    await db.insert(schema.notifications).values(notifications.slice(i, i + 500));
  }
  for (const c of citizens) {
    const codes = earnedBadgeCodes(await contributionStats(c.id));
    if (codes.length) {
      await db
        .insert(schema.userBadges)
        .values(
          codes.map((badgeCode) => ({
            userId: c.id,
            badgeCode,
            awardedAt: new Date(NOW - int(1, 40) * DAY),
          })),
        )
        .onConflictDoNothing();
    }
  }

  await db.execute(sql`REFRESH MATERIALIZED VIEW daily_issue_stats`);
  logger.info(
    {
      issues: plans.length,
      users: inserted.length,
      wards: wards.length,
      seconds: Math.round((Date.now() - started) / 1000),
    },
    `seed complete — sign in with any demo account, password "${DEMO_PASSWORD}"`,
  );
}

seed()
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
