/**
 * Domain enums. Each is a readonly tuple so it can feed both TypeScript unions
 * and zod/Postgres enums from a single definition.
 */

export const USER_ROLES = ['CITIZEN', 'STAFF', 'OFFICIAL', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that work for the Municipal Corporation. */
export const MUNICIPAL_ROLES: readonly UserRole[] = ['STAFF', 'OFFICIAL', 'ADMIN'];
/** Roles that can triage: assign, reject, merge, change priority. */
export const TRIAGE_ROLES: readonly UserRole[] = ['OFFICIAL', 'ADMIN'];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ISSUE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'RESOLVED',
  'VERIFIED',
  'REOPENED',
  'REJECTED',
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REPORT_SOURCES = ['NEW', 'JOINED', 'MERGED'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const MODERATION_STATUSES = ['PENDING', 'APPROVED', 'FLAGGED', 'REJECTED'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const PHOTO_KINDS = ['REPORT', 'WORK_COMPLETION', 'VERIFICATION'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const PHOTO_STATUSES = ['DRAFT', 'ATTACHED', 'HIDDEN'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const ANALYSIS_STATUSES = ['PENDING', 'DONE', 'FAILED', 'SKIPPED'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const VERIFICATION_RESPONSES = ['RESOLVED', 'NOT_FIXED', 'SKIPPED'] as const;
export type VerificationResponse = (typeof VERIFICATION_RESPONSES)[number];

export const VERIFICATION_OUTCOMES = ['PENDING', 'VERIFIED', 'REOPENED', 'EXPIRED'] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export const ISSUE_EVENT_TYPES = [
  'CREATED',
  'REPORT_JOINED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'PRIORITY_CHANGED',
  'CATEGORY_CHANGED',
  'NOTE_ADDED',
  'WORK_PHOTOS_ADDED',
  'VERIFICATION_REQUESTED',
  'VERIFICATION_RESPONSE',
  'REOPENED',
  'VERIFIED',
  'MERGED',
  'MODERATED',
] as const;
export type IssueEventType = (typeof ISSUE_EVENT_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'ISSUE_SUBMITTED',
  'ISSUE_NEW_IN_WARD',
  'ISSUE_ASSIGNED',
  'ISSUE_STATUS_CHANGED',
  'ISSUE_RESOLVED',
  'ISSUE_REOPENED',
  'ISSUE_VERIFIED',
  'VERIFICATION_REQUEST',
  'REPORT_JOINED',
  'BADGE_EARNED',
  'SLA_OVERDUE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const LABELS = {
  status: {
    PENDING: 'Pending',
    IN_PROGRESS: 'In progress',
    RESOLVED: 'Resolved',
    VERIFIED: 'Verified',
    REOPENED: 'Reopened',
    REJECTED: 'Rejected',
  } satisfies Record<IssueStatus, string>,
  priority: {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
  } satisfies Record<Priority, string>,
  role: {
    CITIZEN: 'Citizen',
    STAFF: 'Field staff',
    OFFICIAL: 'Official',
    ADMIN: 'Administrator',
  } satisfies Record<UserRole, string>,
} as const;
