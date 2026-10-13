/**
 * Database schema (Drizzle, snake_case columns). PostGIS columns are generated
 * from lat/lng so application code only ever writes plain numbers.
 * See docs/data-model.md for an ER overview.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  ANALYSIS_STATUSES,
  ISSUE_EVENT_TYPES,
  ISSUE_STATUSES,
  MODERATION_STATUSES,
  NOTIFICATION_TYPES,
  PHOTO_KINDS,
  PHOTO_STATUSES,
  PRIORITIES,
  REPORT_SOURCES,
  USER_ROLES,
  USER_STATUSES,
  VERIFICATION_OUTCOMES,
  VERIFICATION_RESPONSES,
  type NotificationPrefs,
  type PhotoAnalysis,
} from '@urbanfix/shared';

/* ---------- custom column types ---------- */

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const geographyPoint = customType<{ data: string }>({ dataType: () => 'geography(Point,4326)' });
const geometryMultiPolygon = customType<{ data: string }>({ dataType: () => 'geometry(MultiPolygon,4326)' });
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const pointFromLatLng = sql`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`;

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ---------- enums ---------- */

export const userRole = pgEnum('user_role', USER_ROLES);
export const userStatus = pgEnum('user_status', USER_STATUSES);
export const issueStatus = pgEnum('issue_status', ISSUE_STATUSES);
export const priority = pgEnum('priority', PRIORITIES);
export const reportSource = pgEnum('report_source', REPORT_SOURCES);
export const moderationStatus = pgEnum('moderation_status', MODERATION_STATUSES);
export const photoKind = pgEnum('photo_kind', PHOTO_KINDS);
export const photoStatus = pgEnum('photo_status', PHOTO_STATUSES);
export const analysisStatus = pgEnum('analysis_status', ANALYSIS_STATUSES);
export const verificationResponse = pgEnum('verification_response', VERIFICATION_RESPONSES);
export const verificationOutcome = pgEnum('verification_outcome', VERIFICATION_OUTCOMES);
export const issueEventType = pgEnum('issue_event_type', ISSUE_EVENT_TYPES);
export const notificationType = pgEnum('notification_type', NOTIFICATION_TYPES);

/* ---------- reference data ---------- */

export const wards = pgTable(
  'wards',
  {
    id: uuid().primaryKey().defaultRandom(),
    code: varchar({ length: 20 }).notNull().unique(),
    name: varchar({ length: 80 }).notNull(),
    boundary: geometryMultiPolygon(),
    centerLat: doublePrecision(),
    centerLng: doublePrecision(),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('wards_boundary_gix').using('gist', t.boundary)],
);

export const categories = pgTable('categories', {
  id: uuid().primaryKey().defaultRandom(),
  slug: varchar({ length: 60 }).notNull().unique(),
  name: varchar({ length: 60 }).notNull(),
  icon: varchar({ length: 40 }).notNull(),
  color: varchar({ length: 7 }).notNull(),
  description: text().notNull().default(''),
  defaultPriority: priority().notNull().default('MEDIUM'),
  slaHours: integer().notNull().default(72),
  duplicateRadiusM: integer().notNull().default(50),
  relatedSlugs: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(100),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ---------- users & sessions ---------- */

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: citext().unique(),
    passwordHash: text(),
    name: varchar({ length: 80 }).notNull(),
    phone: varchar({ length: 20 }),
    avatarUrl: text(),
    role: userRole().notNull().default('CITIZEN'),
    isGuest: boolean().notNull().default(false),
    wardId: uuid().references(() => wards.id, { onDelete: 'set null' }),
    reputation: integer().notNull().default(0),
    status: userStatus().notNull().default('ACTIVE'),
    notificationPrefs: jsonb()
      .$type<NotificationPrefs>()
      .notNull()
      .default({ push: true, statusUpdates: true, verificationRequests: true }),
    lastSeenAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('users_role_idx').on(t.role), index('users_ward_idx').on(t.wardId)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid().notNull(),
    tokenHash: varchar({ length: 64 }).notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    replacedById: uuid(),
    ip: varchar({ length: 64 }),
    userAgent: varchar({ length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId), index('refresh_tokens_family_idx').on(t.familyId)],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text().notNull().unique(),
    p256dh: varchar({ length: 200 }).notNull(),
    auth: varchar({ length: 100 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

/* ---------- issues & evidence ---------- */

export const issues = pgTable(
  'issues',
  {
    id: uuid().primaryKey().defaultRandom(),
    refNo: serial().notNull().unique(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    wardId: uuid().references(() => wards.id, { onDelete: 'set null' }),
    status: issueStatus().notNull().default('PENDING'),
    priority: priority().notNull().default('MEDIUM'),
    priorityLocked: boolean().notNull().default(false),
    severity: smallint(),
    title: varchar({ length: 120 }).notNull(),
    description: text(),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    location: geographyPoint().generatedAlwaysAs(pointFromLatLng),
    address: text(),
    addressComponents: jsonb().$type<Record<string, string>>(),
    supportCount: integer().notNull().default(0),
    reportCount: integer().notNull().default(0),
    reporterCount: integer().notNull().default(0),
    assigneeId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid().references(() => users.id, { onDelete: 'set null' }),
    coverPhotoId: uuid(),
    mergedIntoId: uuid(),
    reopenedCount: integer().notNull().default(0),
    slaDueAt: timestamp({ withTimezone: true }),
    resolvedAt: timestamp({ withTimezone: true }),
    verifiedAt: timestamp({ withTimezone: true }),
    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    search: tsvector().generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', 'UF-' || lpad(ref_no::text, 6, '0')), 'A') ||
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(address, '')), 'C')`,
    ),
  },
  (t) => [
    index('issues_location_gix').using('gist', t.location),
    index('issues_status_category_idx').on(t.status, t.categoryId),
    index('issues_ward_idx').on(t.wardId),
    index('issues_assignee_idx').on(t.assigneeId),
    index('issues_created_idx').on(t.createdAt),
    index('issues_search_idx').using('gin', t.search),
    index('issues_title_trgm_idx').using('gin', t.title.op('gin_trgm_ops')),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    issueId: uuid()
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    reporterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: reportSource().notNull().default('NEW'),
    description: text(),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    location: geographyPoint().generatedAlwaysAs(pointFromLatLng),
    accuracyM: real(),
    address: text(),
    ai: jsonb().$type<PhotoAnalysis | null>(),
    moderationStatus: moderationStatus().notNull().default('PENDING'),
    duplicateOverride: jsonb().$type<{ issueId: string; score: number }[] | null>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reports_issue_reporter_uq').on(t.issueId, t.reporterId),
    index('reports_reporter_idx').on(t.reporterId),
    index('reports_moderation_idx').on(t.moderationStatus),
    index('reports_location_gix').using('gist', t.location),
  ],
);

export interface PhotoVariants {
  thumb: string;
  medium: string;
  full: string;
}

export const photos = pgTable(
  'photos',
  {
    id: uuid().primaryKey().defaultRandom(),
    uploadedById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issueId: uuid().references(() => issues.id, { onDelete: 'cascade' }),
    reportId: uuid().references(() => reports.id, { onDelete: 'set null' }),
    kind: photoKind().notNull().default('REPORT'),
    status: photoStatus().notNull().default('DRAFT'),
    variants: jsonb().$type<PhotoVariants>().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    bytes: integer().notNull(),
    thumbhash: text(),
    sha256: varchar({ length: 64 }).notNull(),
    phash: varchar({ length: 16 }),
    embedding: real().array(),
    exifLat: doublePrecision(),
    exifLng: doublePrecision(),
    analysisStatus: analysisStatus().notNull().default('PENDING'),
    analysis: jsonb().$type<PhotoAnalysis | null>(),
    moderationFlags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    index('photos_issue_idx').on(t.issueId),
    index('photos_report_idx').on(t.reportId),
    index('photos_uploader_idx').on(t.uploadedById),
    index('photos_sha_idx').on(t.sha256),
    index('photos_status_created_idx').on(t.status, t.createdAt),
  ],
);

export const issueSupporters = pgTable(
  'issue_supporters',
  {
    issueId: uuid()
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isReporter: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.userId] }), index('issue_supporters_user_idx').on(t.userId)],
);

export const issueEvents = pgTable(
  'issue_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    issueId: uuid()
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    type: issueEventType().notNull(),
    fromStatus: issueStatus(),
    toStatus: issueStatus(),
    body: text(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    isInternal: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('issue_events_issue_idx').on(t.issueId, t.createdAt)],
);

/* ---------- verification ---------- */

export const verificationRounds = pgTable(
  'verification_rounds',
  {
    id: uuid().primaryKey().defaultRandom(),
    issueId: uuid()
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    roundNo: integer().notNull(),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closesAt: timestamp({ withTimezone: true }).notNull(),
    closedAt: timestamp({ withTimezone: true }),
    outcome: verificationOutcome().notNull().default('PENDING'),
    eligibleCount: integer().notNull(),
    openedById: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('verification_rounds_issue_round_uq').on(t.issueId, t.roundNo),
    index('verification_rounds_pending_idx')
      .on(t.closesAt)
      .where(sql`outcome = 'PENDING'`),
  ],
);

export const verificationResponses = pgTable(
  'verification_responses',
  {
    id: uuid().primaryKey().defaultRandom(),
    roundId: uuid()
      .notNull()
      .references(() => verificationRounds.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    response: verificationResponse().notNull(),
    comment: text(),
    photoIds: uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('verification_responses_round_user_uq').on(t.roundId, t.userId)],
);

/* ---------- notifications, gamification, audit ---------- */

export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType().notNull(),
    title: varchar({ length: 160 }).notNull(),
    body: text().notNull(),
    issueId: uuid().references(() => issues.id, { onDelete: 'cascade' }),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`read_at IS NULL`),
  ],
);

export const reputationEvents = pgTable(
  'reputation_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer().notNull(),
    reason: varchar({ length: 40 }).notNull(),
    refId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('reputation_events_once_uq').on(t.userId, t.reason, t.refId)],
);

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeCode: varchar({ length: 40 }).notNull(),
    awardedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeCode] })],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: varchar({ length: 60 }).notNull(),
    entityType: varchar({ length: 40 }).notNull(),
    entityId: uuid(),
    diff: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: varchar({ length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_created_idx').on(t.createdAt),
  ],
);

export const geocodeCache = pgTable('geocode_cache', {
  key: varchar({ length: 40 }).primaryKey(),
  result: jsonb().$type<{ address: string; components: Record<string, string> }>().notNull(),
  createdAt: createdAt(),
});

export const appSettings = pgTable('app_settings', {
  key: varchar({ length: 60 }).primaryKey(),
  value: jsonb().notNull(),
  updatedById: uuid().references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
