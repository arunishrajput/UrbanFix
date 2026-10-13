import type { IssueStatus, UserRole } from './enums';

/**
 * Issue lifecycle. This table is the single source of truth: the API rejects
 * transitions that are not listed here and the dashboard only offers listed ones.
 *
 * `system` transitions are performed by the verification workflow, never by a person.
 */
interface Transition {
  to: IssueStatus;
  roles: readonly (UserRole | 'system')[];
}

const STAFF_UP: readonly UserRole[] = ['STAFF', 'OFFICIAL', 'ADMIN'];
const TRIAGE: readonly UserRole[] = ['OFFICIAL', 'ADMIN'];

export const STATUS_TRANSITIONS: Record<IssueStatus, Transition[]> = {
  PENDING: [
    { to: 'IN_PROGRESS', roles: STAFF_UP },
    { to: 'RESOLVED', roles: STAFF_UP },
    { to: 'REJECTED', roles: TRIAGE },
  ],
  IN_PROGRESS: [
    { to: 'RESOLVED', roles: STAFF_UP },
    { to: 'PENDING', roles: TRIAGE },
    { to: 'REJECTED', roles: TRIAGE },
  ],
  RESOLVED: [
    { to: 'VERIFIED', roles: ['system', 'ADMIN'] },
    { to: 'REOPENED', roles: ['system', ...TRIAGE] },
  ],
  REOPENED: [
    { to: 'IN_PROGRESS', roles: STAFF_UP },
    { to: 'RESOLVED', roles: STAFF_UP },
    { to: 'REJECTED', roles: TRIAGE },
  ],
  REJECTED: [{ to: 'PENDING', roles: TRIAGE }],
  VERIFIED: [{ to: 'REOPENED', roles: TRIAGE }],
};

export function canTransition(from: IssueStatus, to: IssueStatus, actor: UserRole | 'system'): boolean {
  return STATUS_TRANSITIONS[from].some((t) => t.to === to && t.roles.includes(actor));
}

export function allowedTransitions(from: IssueStatus, actor: UserRole | 'system'): IssueStatus[] {
  return STATUS_TRANSITIONS[from].filter((t) => t.roles.includes(actor)).map((t) => t.to);
}

/** Statuses where work is still outstanding. */
export const OPEN_STATUSES: readonly IssueStatus[] = ['PENDING', 'IN_PROGRESS', 'REOPENED'];

/**
 * Statuses an incoming report can be matched against. RESOLVED is included on
 * purpose: a new report of the same problem right after it was "resolved" is
 * the strongest possible "still not fixed" signal.
 */
export const DUPLICATE_CANDIDATE_STATUSES: readonly IssueStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'REOPENED',
  'RESOLVED',
];

export const CLOSED_STATUSES: readonly IssueStatus[] = ['VERIFIED', 'REJECTED'];

/** Ordered steps shown in the citizen-facing status stepper. */
export const STATUS_STEPS: readonly IssueStatus[] = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED'];

export function statusStepIndex(status: IssueStatus): number {
  if (status === 'REOPENED') return 1;
  if (status === 'REJECTED') return 0;
  return STATUS_STEPS.indexOf(status);
}
