/**
 * Duplicate-issue scoring.
 *
 * The API finds candidate issues with a PostGIS radius query and then calls
 * `scoreCandidate` for each one. Everything here is pure so it can be unit
 * tested and reasoned about; see docs/duplicate-detection.md for the rationale
 * behind the weights and thresholds.
 */
import { clamp, formatDistance, formatDistanceLong } from './geo';
import { cosineSimilarity, phashSimilarity } from './similarity';
import type { IssueStatus } from './enums';

export interface PhotoSignature {
  sha256?: string | null;
  /** 64-bit perceptual hash as 16 hex chars. */
  phash?: string | null;
  /** Multimodal image embedding (Gemini). */
  embedding?: number[] | null;
}

export interface DuplicateQuery {
  categorySlug?: string | null;
  /** AI-predicted category, used when the citizen has not picked one yet. */
  predictedCategorySlug?: string | null;
  photos: PhotoSignature[];
  textEmbedding?: number[] | null;
  hasText: boolean;
}

export interface DuplicateCandidate {
  issueId: string;
  categorySlug: string;
  /** Category slugs related to the candidate's category (from the categories table). */
  relatedSlugs: string[];
  distanceM: number;
  lastActivityAt: Date;
  photos: PhotoSignature[];
  /** pg_trgm similarity between query text and the candidate's text, if both exist. */
  trigramSimilarity?: number | null;
  textEmbedding?: number[] | null;
}

export type SignalName = 'geo' | 'category' | 'image' | 'text' | 'recency';
export type Signals = Record<SignalName, number | null>;

export type DuplicateLevel = 'LIKELY' | 'POSSIBLE' | 'UNLIKELY';

export type DuplicateReasonCode =
  'SAME_CATEGORY' | 'RELATED_CATEGORY' | 'NEARBY' | 'IDENTICAL_PHOTO' | 'SIMILAR_PHOTO' | 'SIMILAR_TEXT';

export interface DuplicateReason {
  code: DuplicateReasonCode;
  label: string;
}

export interface ScoredCandidate {
  issueId: string;
  score: number;
  level: DuplicateLevel;
  signals: Signals;
  distanceM: number;
  reasons: DuplicateReason[];
}

export const DUPLICATE_WEIGHTS: Record<SignalName, number> = {
  geo: 0.35,
  category: 0.25,
  image: 0.25,
  text: 0.1,
  recency: 0.05,
};

export const DUPLICATE_THRESHOLDS = {
  /** At or above: shown as "likely duplicate"; the API refuses to create a new issue unless dismissed. */
  likely: 0.75,
  /** At or above: shown as "possible duplicate". Below: hidden. */
  possible: 0.5,
  /** Image similarity that overrides a category mismatch (same photo, different category picked). */
  imageOverridesCategory: 0.85,
  /** Related categories never reach "likely" unless the photos also agree at least this much. */
  relatedNeedsImage: 0.6,
} as const;

export const SEARCH_RADIUS = { min: 25, max: 250, fallback: 50 } as const;

/** Candidate search radius: the category's radius, widened for poor GPS fixes, clamped. */
export function searchRadiusM(categoryRadiusM: number | null | undefined, accuracyM?: number | null): number {
  const base = categoryRadiusM ?? SEARCH_RADIUS.fallback;
  const widened = Math.max(base, 2 * (accuracyM ?? 0));
  return clamp(widened, SEARCH_RADIUS.min, SEARCH_RADIUS.max);
}

/** Gaussian decay with sigma = R/2: ~0.89 at 12 m for R = 50 m, ~0.14 at the radius edge. */
export function geoSignal(distanceM: number, radiusM: number): number {
  const sigma = radiusM / 2;
  return Math.exp(-0.5 * (distanceM / sigma) ** 2);
}

export function categorySignal(
  querySlug: string | null | undefined,
  candidateSlug: string,
  candidateRelated: string[],
): number | null {
  if (!querySlug) return null;
  if (querySlug === candidateSlug) return 1;
  if (candidateRelated.includes(querySlug)) return 0.6;
  return 0;
}

/** Maps raw perceptual-hash similarity to 0..1: unrelated images (~0.5) → 0, near-identical (≥0.9) → 1. */
export const phashScore = (sim: number) => clamp((sim - 0.6) / 0.3, 0, 1);
/**
 * Maps image-embedding cosine similarity to 0..1. Gemini multimodal embeddings
 * of unrelated street scenes still score ~0.84–0.88, while a re-shot photo of
 * the same scene scores ~0.98 (see docs/duplicate-detection.md), hence the high floor.
 */
export const imageEmbeddingScore = (cos: number) => clamp((cos - 0.86) / 0.11, 0, 1);
/** Maps trigram similarity of two descriptions to 0..1. */
export const trigramScore = (sim: number) => clamp((sim - 0.1) / 0.5, 0, 1);
/** Maps text-embedding cosine similarity to 0..1. */
export const textEmbeddingScore = (cos: number) => clamp((cos - 0.65) / 0.25, 0, 1);

export function imageSignal(query: PhotoSignature[], candidate: PhotoSignature[]): number | null {
  let best: number | null = null;
  for (const q of query) {
    for (const c of candidate) {
      if (q.sha256 && c.sha256 && q.sha256 === c.sha256) return 1;
      let pair: number | null = null;
      if (q.phash && c.phash && q.phash.length === c.phash.length) {
        pair = phashScore(phashSimilarity(q.phash, c.phash));
      }
      if (q.embedding?.length && c.embedding?.length === q.embedding.length) {
        const e = imageEmbeddingScore(cosineSimilarity(q.embedding, c.embedding));
        pair = pair === null ? e : Math.max(pair, e);
      }
      if (pair !== null) best = best === null ? pair : Math.max(best, pair);
    }
  }
  return best;
}

export function textSignal(query: DuplicateQuery, candidate: DuplicateCandidate): number | null {
  if (!query.hasText) return null;
  const scores: number[] = [];
  if (candidate.trigramSimilarity != null) scores.push(trigramScore(candidate.trigramSimilarity));
  if (query.textEmbedding?.length && candidate.textEmbedding?.length === query.textEmbedding.length) {
    scores.push(textEmbeddingScore(cosineSimilarity(query.textEmbedding, candidate.textEmbedding)));
  }
  return scores.length ? Math.max(...scores) : null;
}

export function recencySignal(lastActivityAt: Date, now: Date): number {
  const days = Math.max(0, (now.getTime() - lastActivityAt.getTime()) / 86_400_000);
  return Math.exp(-days / 30);
}

/** Weighted mean over the signals that are present (missing signals neither help nor hurt). */
export function combineSignals(signals: Signals, weights = DUPLICATE_WEIGHTS): number {
  let sum = 0;
  let total = 0;
  for (const name of Object.keys(weights) as SignalName[]) {
    const value = signals[name];
    if (value === null) continue;
    sum += weights[name] * value;
    total += weights[name];
  }
  return total === 0 ? 0 : sum / total;
}

export function duplicateLevelFor(score: number): DuplicateLevel {
  if (score >= DUPLICATE_THRESHOLDS.likely) return 'LIKELY';
  if (score >= DUPLICATE_THRESHOLDS.possible) return 'POSSIBLE';
  return 'UNLIKELY';
}

export interface ScoreOptions {
  radiusM: number;
  now?: Date;
  /** slug → display name, for human-readable reasons. */
  categoryNames?: Record<string, string>;
}

/**
 * Scores one candidate. Returns null when the candidate should be excluded
 * outright (a different, unrelated category with no strong photo match).
 */
export function scoreCandidate(
  query: DuplicateQuery,
  candidate: DuplicateCandidate,
  opts: ScoreOptions,
): ScoredCandidate | null {
  const now = opts.now ?? new Date();
  const effectiveCategory = query.categorySlug ?? query.predictedCategorySlug ?? null;

  const signals: Signals = {
    geo: geoSignal(candidate.distanceM, opts.radiusM),
    category: categorySignal(effectiveCategory, candidate.categorySlug, candidate.relatedSlugs),
    image: imageSignal(query.photos, candidate.photos),
    text: textSignal(query, candidate),
    recency: recencySignal(candidate.lastActivityAt, now),
  };

  const image = signals.image ?? 0;
  if (signals.category === 0 && image < DUPLICATE_THRESHOLDS.imageOverridesCategory) return null;

  let score = combineSignals(signals);
  const isRelatedOnly = signals.category !== null && signals.category > 0 && signals.category < 1;
  if (isRelatedOnly && image < DUPLICATE_THRESHOLDS.relatedNeedsImage) {
    score = Math.min(score, DUPLICATE_THRESHOLDS.likely - 0.01);
  }
  score = Math.round(score * 1000) / 1000;

  return {
    issueId: candidate.issueId,
    score,
    level: duplicateLevelFor(score),
    signals,
    distanceM: candidate.distanceM,
    reasons: buildReasons(
      signals,
      candidate,
      opts.categoryNames ?? {},
      sameFile(query.photos, candidate.photos),
    ),
  };
}

/** True when the citizen uploaded a byte-identical file to one already on the issue. */
function sameFile(query: PhotoSignature[], candidate: PhotoSignature[]): boolean {
  return query.some((q) => q.sha256 && candidate.some((c) => c.sha256 === q.sha256));
}

function buildReasons(
  signals: Signals,
  candidate: DuplicateCandidate,
  names: Record<string, string>,
  identicalFile: boolean,
): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  const name = names[candidate.categorySlug] ?? candidate.categorySlug;
  if (signals.category === 1) reasons.push({ code: 'SAME_CATEGORY', label: `Same category: ${name}` });
  else if (signals.category && signals.category > 0)
    reasons.push({ code: 'RELATED_CATEGORY', label: `Related category: ${name}` });
  reasons.push({ code: 'NEARBY', label: `${formatDistance(candidate.distanceM)} away` });
  if (signals.image !== null) {
    if (identicalFile) reasons.push({ code: 'IDENTICAL_PHOTO', label: 'Same photo' });
    else if (signals.image >= 0.75) reasons.push({ code: 'SIMILAR_PHOTO', label: 'Very similar photo' });
    else if (signals.image >= 0.4) reasons.push({ code: 'SIMILAR_PHOTO', label: 'Similar photo' });
  }
  if (signals.text !== null && signals.text >= 0.4) {
    reasons.push({ code: 'SIMILAR_TEXT', label: 'Similar description' });
  }
  return reasons;
}

/** Ranks candidates and drops the ones not worth showing. */
export function rankCandidates(scored: (ScoredCandidate | null)[], limit = 5): ScoredCandidate[] {
  return scored
    .filter((s): s is ScoredCandidate => s !== null && s.level !== 'UNLIKELY')
    .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM)
    .slice(0, limit);
}

/** "There is already an open Garbage issue reported 12 meters away." */
export function duplicateHeadline(categoryName: string, distanceM: number, status: IssueStatus): string {
  const distance = formatDistanceLong(distanceM);
  if (status === 'RESOLVED') {
    return `A ${categoryName} issue ${distance} away was recently marked resolved. Is it still not fixed?`;
  }
  return `There is already an open ${categoryName} issue reported ${distance} away.`;
}
