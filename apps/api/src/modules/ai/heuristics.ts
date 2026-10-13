/**
 * Offline fallbacks used when Gemini is unavailable. They are deliberately
 * simple: keyword matching for category, category defaults for severity.
 */
import { DEFAULT_CATEGORIES, type PhotoAnalysis, type Priority } from '@urbanfix/shared';

export interface CategoryLike {
  slug: string;
  name: string;
  defaultPriority: Priority;
}

const keywordIndex = new Map(DEFAULT_CATEGORIES.map((c) => [c.slug, c.keywords]));

/** Scores categories by keyword hits in free text. Returns null when nothing matches. */
export function predictCategoryFromText(
  text: string | null | undefined,
  categories: CategoryLike[],
): { slug: string; confidence: number } | null {
  if (!text) return null;
  const haystack = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')} `;
  let best: { slug: string; hits: number } | null = null;
  for (const cat of categories) {
    const words = [...(keywordIndex.get(cat.slug) ?? []), cat.name.toLowerCase()];
    const hits = words.filter((w) => haystack.includes(` ${w}`)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { slug: cat.slug, hits };
  }
  if (!best) return null;
  return { slug: best.slug, confidence: Math.min(0.75, 0.35 + best.hits * 0.15) };
}

const SEVERITY_BY_PRIORITY: Record<Priority, number> = { LOW: 2, MEDIUM: 3, HIGH: 4, CRITICAL: 5 };

export function heuristicAnalysis(categories: CategoryLike[], text?: string | null): PhotoAnalysis {
  const guess = predictCategoryFromText(text, categories);
  const cat = guess ? categories.find((c) => c.slug === guess.slug) : undefined;
  return {
    categorySlug: guess?.slug ?? null,
    confidence: guess?.confidence ?? 0,
    alternatives: [],
    caption: null,
    descriptionSuggestion: null,
    severity: cat ? SEVERITY_BY_PRIORITY[cat.defaultPriority] : null,
    severityReason: cat ? 'Estimated from the category (AI unavailable)' : null,
    suggestedPriority: cat?.defaultPriority ?? null,
    moderation: { safe: true, flags: ['unscreened'], reason: 'Not screened: AI unavailable' },
    ocrText: null,
    isCivicIssue: true,
    source: 'heuristic',
    model: null,
  };
}

/** Default issue title when no AI caption exists. */
export function fallbackTitle(categoryName: string, address?: string | null): string {
  const place = address?.split(',')[0]?.trim();
  return (place ? `${categoryName} near ${place}` : `${categoryName} reported`).slice(0, 120);
}
