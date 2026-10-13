export const REPUTATION = {
  REPORT_CREATED: 10,
  REPORT_JOINED: 5,
  VERIFICATION_RESPONSE: 3,
  ISSUE_VERIFIED: 15,
  REPORT_REJECTED_SPAM: -20,
} as const;
export type ReputationReason = keyof typeof REPUTATION;

export interface ContributionStats {
  reportsCreated: number;
  reportsJoined: number;
  verifications: number;
  issuesVerified: number;
  /** Issues this user reported first that later gathered 10+ supporters. */
  eagleEyeIssues: number;
}

export interface BadgeDefinition {
  code: string;
  name: string;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  earned: (s: ContributionStats) => boolean;
  progress: (s: ContributionStats) => { current: number; target: number };
}

const threshold = (key: keyof ContributionStats, target: number) => (s: ContributionStats) => ({
  current: Math.min(s[key], target),
  target,
});

export const BADGES: BadgeDefinition[] = [
  {
    code: 'FIRST_REPORT',
    name: 'First Report',
    description: 'Reported your first civic issue.',
    icon: 'Flag',
    earned: (s) => s.reportsCreated + s.reportsJoined >= 1,
    progress: (s) => ({ current: Math.min(1, s.reportsCreated + s.reportsJoined), target: 1 }),
  },
  {
    code: 'CIVIC_STARTER',
    name: 'Civic Starter',
    description: 'Created 5 reports.',
    icon: 'Sprout',
    earned: (s) => s.reportsCreated >= 5,
    progress: threshold('reportsCreated', 5),
  },
  {
    code: 'NEIGHBORHOOD_HERO',
    name: 'Neighborhood Hero',
    description: 'Created 25 reports.',
    icon: 'ShieldCheck',
    earned: (s) => s.reportsCreated >= 25,
    progress: threshold('reportsCreated', 25),
  },
  {
    code: 'TEAM_PLAYER',
    name: 'Team Player',
    description: 'Joined 10 existing issues instead of filing duplicates.',
    icon: 'Users',
    earned: (s) => s.reportsJoined >= 10,
    progress: threshold('reportsJoined', 10),
  },
  {
    code: 'VERIFIER',
    name: 'Verifier',
    description: 'Checked 10 fixes on the ground.',
    icon: 'BadgeCheck',
    earned: (s) => s.verifications >= 10,
    progress: threshold('verifications', 10),
  },
  {
    code: 'EAGLE_EYE',
    name: 'Eagle Eye',
    description: 'First to report an issue that 10+ citizens supported.',
    icon: 'Eye',
    earned: (s) => s.eagleEyeIssues >= 1,
    progress: threshold('eagleEyeIssues', 1),
  },
  {
    code: 'FIX_CHAMPION',
    name: 'Fix Champion',
    description: '5 of your issues were fixed and verified.',
    icon: 'Trophy',
    earned: (s) => s.issuesVerified >= 5,
    progress: threshold('issuesVerified', 5),
  },
];

export function earnedBadgeCodes(stats: ContributionStats): string[] {
  return BADGES.filter((b) => b.earned(stats)).map((b) => b.code);
}

export const LEVELS = [
  { min: 0, name: 'Newcomer' },
  { min: 50, name: 'Contributor' },
  { min: 150, name: 'Guardian' },
  { min: 400, name: 'Champion' },
  { min: 1000, name: 'City Legend' },
] as const;

export function reputationLevel(reputation: number) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (reputation >= LEVELS[i]!.min) index = i;
  const current = LEVELS[index]!;
  const next = LEVELS[index + 1] ?? null;
  const progress = next ? (reputation - current.min) / (next.min - current.min) : 1;
  return { index, name: current.name, min: current.min, next, progress: Math.max(0, Math.min(1, progress)) };
}
