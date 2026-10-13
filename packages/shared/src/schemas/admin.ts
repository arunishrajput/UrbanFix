import { z } from 'zod';
import { PRIORITIES, USER_ROLES, USER_STATUSES } from '../enums';
import { pageQuery } from './common';

export const adminUsersQuery = pageQuery.extend({
  q: z.string().trim().max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
  role: z.enum(USER_ROLES),
  wardId: z.uuid().nullable().optional(),
  phone: z.string().trim().max(20).optional(),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  wardId: z.uuid().nullable().optional(),
});

export const categoryUpsertSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only'),
  name: z.string().trim().min(2).max(60),
  icon: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().trim().max(300).default(''),
  defaultPriority: z.enum(PRIORITIES),
  slaHours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  duplicateRadiusM: z.coerce.number().int().min(10).max(250),
  relatedSlugs: z.array(z.string().max(60)).max(10).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
});
export type CategoryUpsertInput = z.infer<typeof categoryUpsertSchema>;

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z.array(position).min(4);
export const geoJsonBoundarySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1)).min(1) }),
]);
export type GeoJsonBoundary = z.infer<typeof geoJsonBoundarySchema>;

export const wardUpsertSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(80),
  boundary: geoJsonBoundarySchema.nullable().optional(),
  isActive: z.boolean().default(true),
});
export type WardUpsertInput = z.infer<typeof wardUpsertSchema>;

export const moderationQuery = pageQuery.extend({
  status: z.enum(['FLAGGED', 'PENDING', 'REJECTED']).default('FLAGGED'),
});

export const moderationDecisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(500).optional(),
});

export const settingsSchema = z.object({
  windowHours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30),
  minConfirmations: z.coerce.number().int().min(1).max(20),
  ratio: z.coerce.number().min(0.1).max(1),
  autoVerifyOnSilence: z.boolean(),
  requireCompletionPhoto: z.boolean(),
});

export const auditQuery = pageQuery.extend({
  entityType: z.string().max(40).optional(),
  actorId: z.uuid().optional(),
});
