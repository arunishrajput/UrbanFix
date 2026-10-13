import { z } from 'zod';
import { ISSUE_STATUSES, PHOTO_KINDS, PRIORITIES, VERIFICATION_RESPONSES } from '../enums';
import { accuracySchema, csvEnum, csvString, cursorQuery, latSchema, lngSchema, trimmedText } from './common';

const uploadIds = z.array(z.uuid()).max(4);
const slug = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9-]+$/);

export const uploadQuerySchema = z.object({
  kind: z.enum(PHOTO_KINDS).default('REPORT'),
});

export const duplicateCheckSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  accuracyM: accuracySchema,
  categorySlug: slug.optional(),
  description: trimmedText(1000),
  uploadIds: uploadIds.default([]),
});
export type DuplicateCheckInput = z.infer<typeof duplicateCheckSchema>;

export const createIssueSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  accuracyM: accuracySchema,
  address: trimmedText(300),
  categorySlug: slug,
  description: trimmedText(1000),
  uploadIds: uploadIds.min(1, 'Add at least one photo'),
  /** Candidates the citizen saw and explicitly chose not to join. */
  dismissedCandidateIds: z.array(z.uuid()).max(20).default([]),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const joinIssueSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  accuracyM: accuracySchema,
  description: trimmedText(1000),
  uploadIds: uploadIds.min(1, 'Add a photo as evidence'),
});
export type JoinIssueInput = z.infer<typeof joinIssueSchema>;

export const ISSUE_SORTS = ['newest', 'updated', 'support', 'priority', 'nearest'] as const;

export const listIssuesQuery = cursorQuery.extend({
  status: csvEnum(ISSUE_STATUSES),
  category: csvString,
  priority: csvEnum(PRIORITIES),
  wardId: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(ISSUE_SORTS).default('newest'),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
});
export type ListIssuesQuery = z.infer<typeof listIssuesQuery>;

export const mapQuery = z.object({
  bbox: z.string().max(100),
  category: csvString,
  status: csvEnum(ISSUE_STATUSES),
  priority: csvEnum(PRIORITIES),
  wardId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type MapQuery = z.infer<typeof mapQuery>;

export const nearbyQuery = z.object({
  lat: latSchema,
  lng: lngSchema,
  radiusM: z.coerce.number().min(50).max(10_000).default(2000),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const verificationResponseSchema = z
  .object({
    response: z.enum(VERIFICATION_RESPONSES),
    comment: trimmedText(1000),
    uploadIds: uploadIds.default([]),
  })
  .refine((v) => v.response !== 'NOT_FIXED' || v.uploadIds.length > 0, {
    message: 'Add a photo showing the problem is still there',
    path: ['uploadIds'],
  });
export type VerificationResponseInput = z.infer<typeof verificationResponseSchema>;

export const reverseGeocodeQuery = z.object({ lat: latSchema, lng: lngSchema });
