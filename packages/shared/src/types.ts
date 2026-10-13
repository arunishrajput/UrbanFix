/**
 * Response shapes returned by the API and consumed by the web app.
 * Keeping them here means a field rename breaks the build on both sides.
 */
import type {
  AnalysisStatus,
  IssueEventType,
  IssueStatus,
  ModerationStatus,
  NotificationType,
  PhotoKind,
  PhotoStatus,
  Priority,
  ReportSource,
  UserRole,
  UserStatus,
  VerificationOutcome,
  VerificationResponse,
} from './enums';
import type { DuplicateLevel, DuplicateReason } from './duplicates';
import type { ContributionStats } from './gamification';
import type { LatLng } from './geo';
import type { GeoJsonBoundary } from './schemas/admin';
import type { VerificationSettings } from './verification';

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/* ---------- auth & users ---------- */

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  isGuest: boolean;
  wardId: string | null;
  avatarUrl: string | null;
  reputation: number;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export interface NotificationPrefs {
  push: boolean;
  statusUpdates: boolean;
  verificationRequests: boolean;
}

export interface AdminUserRow extends AuthUser {
  phone: string | null;
  status: UserStatus;
  wardName: string | null;
  reportCount: number;
  lastSeenAt: string | null;
}

/* ---------- reference data ---------- */

export interface CategoryDTO {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  defaultPriority: Priority;
  slaHours: number;
  duplicateRadiusM: number;
  relatedSlugs: string[];
  isActive: boolean;
  sortOrder: number;
}

export type CategoryRef = Pick<CategoryDTO, 'slug' | 'name' | 'icon' | 'color'>;

export interface WardDTO {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  center: LatLng | null;
  boundary: GeoJsonBoundary | null;
  openIssues?: number;
}

/* ---------- photos & AI ---------- */

export interface PhotoAnalysis {
  categorySlug: string | null;
  confidence: number;
  alternatives: { slug: string; confidence: number }[];
  caption: string | null;
  descriptionSuggestion: string | null;
  severity: number | null;
  severityReason: string | null;
  suggestedPriority: Priority | null;
  moderation: { safe: boolean; flags: string[]; reason: string | null };
  ocrText: string | null;
  isCivicIssue: boolean;
  source: 'gemini' | 'heuristic';
  model: string | null;
}

export interface PhotoDTO {
  id: string;
  kind: PhotoKind;
  status: PhotoStatus;
  url: string;
  thumbUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  thumbhash: string | null;
  caption: string | null;
  createdAt: string;
}

export interface UploadDTO extends PhotoDTO {
  analysisStatus: AnalysisStatus;
  analysis: PhotoAnalysis | null;
  exifLocation: LatLng | null;
}

/* ---------- issues ---------- */

export interface IssueSummary {
  id: string;
  ref: string;
  title: string;
  status: IssueStatus;
  priority: Priority;
  category: CategoryRef;
  lat: number;
  lng: number;
  address: string | null;
  wardName: string | null;
  supportCount: number;
  reportCount: number;
  reporterCount: number;
  coverPhoto: Pick<PhotoDTO, 'url' | 'thumbUrl' | 'thumbhash'> | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  distanceM?: number;
}

export interface VerificationRoundDTO {
  id: string;
  roundNo: number;
  openedAt: string;
  closesAt: string;
  closedAt: string | null;
  outcome: VerificationOutcome;
  eligibleCount: number;
  tally: { resolved: number; notFixed: number; skipped: number };
}

export interface IssueViewerState {
  isSupporter: boolean;
  isReporter: boolean;
  /** Present when there is an open verification round this viewer may answer. */
  pendingVerification: VerificationRoundDTO | null;
  myVerification: VerificationResponse | null;
}

export interface IssueDetail extends IssueSummary {
  description: string | null;
  severity: number | null;
  ward: { id: string; code: string; name: string } | null;
  photos: PhotoDTO[];
  workPhotos: PhotoDTO[];
  assignee: { id: string; name: string } | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  reopenedCount: number;
  slaDueAt: string | null;
  mergedIntoId: string | null;
  verificationRounds: VerificationRoundDTO[];
  /** Anonymised initials of the first few reporters, for an avatar stack. */
  reporterInitials: string[];
  viewer: IssueViewerState;
}

export interface ReportDTO {
  id: string;
  source: ReportSource;
  description: string | null;
  photos: PhotoDTO[];
  createdAt: string;
  reporter: { displayName: string; initials: string; isYou: boolean };
  distanceFromIssueM: number;
  moderationStatus: ModerationStatus;
}

export interface TimelineEventDTO {
  id: string;
  type: IssueEventType;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus | null;
  body: string | null;
  actor: { name: string; role: UserRole } | null;
  payload: Record<string, unknown>;
  isInternal: boolean;
  createdAt: string;
}

export interface DuplicateCandidateDTO {
  issue: IssueSummary;
  score: number;
  level: DuplicateLevel;
  reasons: DuplicateReason[];
  distanceM: number;
  headline: string;
  /** The citizen already reported this issue; offer "view" instead of "join". */
  alreadyReported: boolean;
}

export interface DuplicateCheckResult {
  radiusM: number;
  candidates: DuplicateCandidateDTO[];
  /** Headline for the best candidate, e.g. "There is already an open Garbage issue reported 12 meters away." */
  headline: string | null;
  /** True when submitting a new issue would be refused until the citizen dismisses the likely candidates. */
  blocking: boolean;
  /** Present when the citizen already reported an open issue of this category nearby. */
  ownRecentIssueId: string | null;
}

export interface CreateIssueResult {
  issue: IssueDetail;
}

export interface JoinIssueResult {
  issue: IssueDetail;
  reopened: boolean;
}

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  status: IssueStatus;
  priority: Priority;
  category: string;
  supportCount: number;
  title: string;
}

/** [lat, lng, weight 0..1] */
export type HeatPoint = [number, number, number];

/* ---------- officials ---------- */

export interface ManageIssueRow extends IssueSummary {
  assignee: { id: string; name: string } | null;
  slaDueAt: string | null;
  overdue: boolean;
  flagged: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: UserRole;
  wardId: string | null;
  wardName: string | null;
  openAssignments: number;
}

export interface ManageStats {
  open: number;
  unassigned: number;
  overdue: number;
  resolvedThisWeek: number;
  avgResolutionHours: number | null;
  reopenRate: number;
  byStatus: Record<IssueStatus, number>;
}

export interface ManageIssueDetail extends IssueDetail {
  /** Priority was set by an official; automatic adjustments are off. */
  priorityLocked: boolean;
  reports: (ReportDTO & { reporterId: string; reporterEmail: string | null })[];
  allowedTransitions: IssueStatus[];
  flaggedReports: number;
  duplicateOverrides: { reportId: string; dismissed: { issueId: string; score: number }[] }[];
}

/* ---------- notifications ---------- */

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  issueId: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/* ---------- profile & gamification ---------- */

export interface BadgeDTO {
  code: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string | null;
  progress: { current: number; target: number };
}

export interface ProfileDTO {
  user: AuthUser & { phone: string | null; notificationPrefs: NotificationPrefs };
  level: {
    index: number;
    name: string;
    min: number;
    next: { min: number; name: string } | null;
    progress: number;
  };
  stats: ContributionStats & { reputation: number; supportGiven: number; resolvedCount: number };
  badges: BadgeDTO[];
}

export interface MyReportRow extends IssueSummary {
  source: ReportSource;
  reportedAt: string;
}

export interface PendingVerification {
  issue: IssueSummary;
  round: VerificationRoundDTO;
}

/* ---------- admin ---------- */

export interface ModerationItem {
  reportId: string;
  issueId: string;
  issueRef: string;
  issueTitle: string;
  moderationStatus: ModerationStatus;
  description: string | null;
  photos: (PhotoDTO & { flags: string[]; reason: string | null })[];
  reporter: { id: string; name: string; email: string | null };
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  actor: { id: string; name: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  diff: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export type AppSettings = VerificationSettings;

/* ---------- analytics ---------- */

export interface AnalyticsOverview {
  totalIssues: number;
  openIssues: number;
  resolvedIssues: number;
  verifiedIssues: number;
  avgResolutionHours: number | null;
  medianResolutionHours: number | null;
  activeCitizens: number;
  totalReports: number;
  joinedReports: number;
  /** Share of all reports that joined an existing issue instead of creating a duplicate. */
  joinRate: number;
  slaCompliance: number | null;
  reopenRate: number;
}

export interface DailyPoint {
  date: string;
  created: number;
  resolved: number;
}

export interface CategoryStat {
  slug: string;
  name: string;
  color: string;
  total: number;
  open: number;
  avgResolutionHours: number | null;
}

export interface WardStat {
  wardId: string;
  code: string;
  name: string;
  total: number;
  open: number;
  resolved: number;
  medianResolutionHours: number | null;
  slaCompliance: number | null;
  reopenRate: number;
}

export interface ResolutionBucket {
  label: string;
  count: number;
}

export interface ParticipationPoint {
  week: string;
  activeReporters: number;
  newIssues: number;
  joins: number;
  verifications: number;
}

/* ---------- realtime ---------- */

export interface ServerToClientEvents {
  'notification:new': (n: NotificationDTO) => void;
  'issue:created': (p: MapPoint & { wardId: string | null }) => void;
  'issue:updated': (p: {
    id: string;
    status?: IssueStatus;
    priority?: Priority;
    supportCount?: number;
  }) => void;
  'upload:analyzed': (p: { id: string; analysisStatus: AnalysisStatus }) => void;
}

export interface ClientToServerEvents {
  'issue:watch': (issueId: string) => void;
  'issue:unwatch': (issueId: string) => void;
  'map:watch': () => void;
}

export interface PublicStats {
  reportedLast30Days: number;
  fixedLast30Days: number;
  verifiedTotal: number;
  openNow: number;
  activeCitizens: number;
  duplicatesAvoided: number;
  joinRate: number;
}
