import type { Priority } from './enums';
import { PRIORITIES } from './enums';

export interface PriorityInput {
  categoryDefault: Priority;
  /** AI-estimated severity, 1 (cosmetic) – 5 (dangerous). */
  severity?: number | null;
  supportCount: number;
  reopenedCount: number;
  slaBreached?: boolean;
}

const RANK: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/**
 * Suggested priority. Category sets the baseline, AI severity adjusts it, and
 * community signals (many supporters, repeated reopenings, SLA breach) push it up.
 * Officials can override and lock the result.
 */
export function computePriority(input: PriorityInput): { priority: Priority; score: number } {
  const base = RANK[input.categoryDefault];
  const severity = input.severity != null ? 0.8 * Math.min(5, Math.max(1, input.severity)) : null;
  let score = severity === null ? base : 0.5 * base + 0.5 * severity;
  score += Math.min(1, Math.log2(Math.max(1, input.supportCount)) * 0.3);
  score += Math.min(1, input.reopenedCount * 0.5);
  if (input.slaBreached) score += 0.5;

  const priority: Priority =
    score < 1.75 ? 'LOW' : score < 2.6 ? 'MEDIUM' : score < 3.4 ? 'HIGH' : 'CRITICAL';
  return { priority, score: Math.round(score * 100) / 100 };
}

export function maxPriority(a: Priority, b: Priority): Priority {
  return RANK[a] >= RANK[b] ? a : b;
}

export function bumpPriority(p: Priority): Priority {
  return PRIORITIES[Math.min(PRIORITIES.length - 1, PRIORITIES.indexOf(p) + 1)]!;
}

export const priorityRank = (p: Priority) => RANK[p];
