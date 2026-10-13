import { z } from 'zod';
import { ISSUE_STATUSES, PRIORITIES } from '../enums';
import { csvEnum, csvString, pageQuery, trimmedText } from './common';

export const MANAGE_SORTS = ['newest', 'oldest', 'updated', 'priority', 'support', 'sla'] as const;

export const manageListQuery = pageQuery.extend({
  status: csvEnum(ISSUE_STATUSES),
  category: csvString,
  priority: csvEnum(PRIORITIES),
  wardId: z.uuid().optional(),
  assignee: z.union([z.uuid(), z.enum(['me', 'unassigned'])]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().max(120).optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: z.enum(MANAGE_SORTS).default('newest'),
});
export type ManageListQuery = z.infer<typeof manageListQuery>;

export const assignSchema = z.object({ assigneeId: z.uuid().nullable() });

export const statusChangeSchema = z.object({
  status: z.enum(ISSUE_STATUSES),
  note: trimmedText(1000),
});
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

export const patchIssueSchema = z
  .object({
    priority: z.enum(PRIORITIES).optional(),
    priorityLocked: z.boolean().optional(),
    categorySlug: z.string().max(60).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const workPhotosSchema = z.object({
  uploadIds: z.array(z.uuid()).min(1).max(6),
  note: trimmedText(1000),
});

export const mergeSchema = z.object({ targetIssueId: z.uuid() });
