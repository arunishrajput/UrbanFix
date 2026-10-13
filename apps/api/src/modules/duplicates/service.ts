/**
 * Duplicate detection: PostGIS finds nearby open issues, then each candidate
 * is scored on distance, category, photo similarity (SHA-256, perceptual hash,
 * Gemini image embeddings), text similarity (pg_trgm over descriptions and AI
 * captions) and recency. Scoring rules live in @urbanfix/shared/duplicates.
 */
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  DUPLICATE_CANDIDATE_STATUSES,
  duplicateHeadline,
  rankCandidates,
  scoreCandidate,
  searchRadiusM,
  type DuplicateCheckResult,
  type DuplicateQuery,
  type IssueStatus,
  type PhotoSignature,
} from '@urbanfix/shared';
import { type DbOrTx, db, schema } from '../../db/client';
import { getCategories } from '../../lib/categories';
import { predictCategoryFromText } from '../ai/heuristics';
import { getSummaries } from '../issues/repo';

const { photos } = schema;
type PhotoRow = typeof photos.$inferSelect;

export interface DuplicateSearch {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  categorySlug?: string | null;
  description?: string | null;
  photos: PhotoRow[];
  userId?: string | null;
  dismissedIds?: string[];
  /** Exclude these issues (e.g. the issue being merged). */
  excludeIds?: string[];
}

type CandidateRow = {
  id: string;
  category_slug: string;
  related_slugs: string[];
  status: IssueStatus;
  last_activity_at: Date;
  distance_m: number;
  trgm: number | null;
  is_mine: boolean;
};

const MAX_CANDIDATES = 30;

/** The most confident AI category across the citizen's photos, or a keyword guess from the description. */
async function predictedCategory(photoRows: PhotoRow[], description?: string | null) {
  const best = photoRows
    .map((p) => p.analysis)
    .filter((a): a is NonNullable<typeof a> => Boolean(a?.categorySlug) && a!.source === 'gemini')
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (best?.categorySlug && best.confidence >= 0.5) return best.categorySlug;
  return predictCategoryFromText(description, await getCategories())?.slug ?? null;
}

export async function checkDuplicates(
  search: DuplicateSearch,
  dbx: DbOrTx = db,
): Promise<DuplicateCheckResult> {
  const categories = await getCategories();
  const category = search.categorySlug ? categories.find((c) => c.slug === search.categorySlug) : undefined;
  const predicted = category ? null : await predictedCategory(search.photos, search.description);
  const effective = category ?? categories.find((c) => c.slug === predicted);
  const radiusM = searchRadiusM(effective?.duplicateRadiusM, search.accuracyM);

  const captions = search.photos.map((p) => p.analysis?.caption).filter(Boolean);
  const queryText = [search.description, ...captions].filter(Boolean).join('. ').slice(0, 1500);
  const point = sql`ST_SetSRID(ST_MakePoint(${search.lng}, ${search.lat}), 4326)::geography`;
  const statuses = sql.join(
    DUPLICATE_CANDIDATE_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  const exclude = search.excludeIds?.length
    ? sql`AND i.id NOT IN (${sql.join(
        search.excludeIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`
    : sql``;

  const res = await dbx.execute<CandidateRow>(sql`
    SELECT i.id,
           c.slug AS category_slug,
           c.related_slugs,
           i.status,
           i.last_activity_at,
           ST_Distance(i.location, ${point}) AS distance_m,
           ${
             queryText
               ? sql`similarity(coalesce(i.title, '') || ' ' || coalesce(i.description, ''), ${queryText})`
               : sql`NULL::real`
           } AS trgm,
           ${
             search.userId
               ? sql`EXISTS (SELECT 1 FROM reports r WHERE r.issue_id = i.id AND r.reporter_id = ${search.userId})`
               : sql`false`
           } AS is_mine
    FROM issues i
    JOIN categories c ON c.id = i.category_id
    WHERE i.merged_into_id IS NULL
      AND i.status IN (${statuses})
      AND ST_DWithin(i.location, ${point}, ${radiusM})
      ${exclude}
    ORDER BY i.location <-> ${point}
    LIMIT ${MAX_CANDIDATES}`);
  const rows = res.rows;
  if (!rows.length)
    return { radiusM, candidates: [], headline: null, blocking: false, ownRecentIssueId: null };

  const photoRows = await dbx
    .select({
      issueId: photos.issueId,
      sha256: photos.sha256,
      phash: photos.phash,
      embedding: photos.embedding,
    })
    .from(photos)
    .where(
      and(
        inArray(
          photos.issueId,
          rows.map((r) => r.id),
        ),
        ne(photos.kind, 'WORK_COMPLETION'),
        ne(photos.status, 'HIDDEN'),
      ),
    );
  const photosByIssue = new Map<string, PhotoSignature[]>();
  for (const p of photoRows) {
    const list = photosByIssue.get(p.issueId!) ?? [];
    list.push({ sha256: p.sha256, phash: p.phash, embedding: p.embedding });
    photosByIssue.set(p.issueId!, list);
  }

  const query: DuplicateQuery = {
    categorySlug: category?.slug ?? null,
    predictedCategorySlug: predicted,
    photos: search.photos.map((p) => ({ sha256: p.sha256, phash: p.phash, embedding: p.embedding })),
    hasText: Boolean(queryText),
  };
  const categoryNames = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const now = new Date();
  const ranked = rankCandidates(
    rows.map((r) =>
      scoreCandidate(
        query,
        {
          issueId: r.id,
          categorySlug: r.category_slug,
          relatedSlugs: r.related_slugs ?? [],
          distanceM: Number(r.distance_m),
          lastActivityAt: new Date(r.last_activity_at),
          photos: photosByIssue.get(r.id) ?? [],
          trigramSimilarity: r.trgm == null ? null : Number(r.trgm),
        },
        { radiusM, now, categoryNames },
      ),
    ),
  );

  const summaries = await getSummaries(
    ranked.map((r) => r.issueId),
    dbx,
  );
  const meta = new Map(rows.map((r) => [r.id, r]));
  const dismissed = new Set(search.dismissedIds ?? []);
  const candidates = ranked
    .filter((r) => summaries.has(r.issueId))
    .map((r) => {
      const issue = summaries.get(r.issueId)!;
      return {
        issue,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
        distanceM: Math.round(r.distanceM),
        headline: duplicateHeadline(issue.category.name, r.distanceM, issue.status),
        alreadyReported: Boolean(meta.get(r.issueId)?.is_mine),
      };
    });

  const own = candidates.find((c) => c.alreadyReported && !dismissed.has(c.issue.id));
  const blocking = candidates.some((c) => c.level === 'LIKELY' && !dismissed.has(c.issue.id));
  return {
    radiusM,
    candidates,
    headline: candidates[0]?.headline ?? null,
    blocking: blocking || Boolean(own),
    ownRecentIssueId: own?.issue.id ?? null,
  };
}

/** Loads the user's draft photos for a duplicate check (ignores ids that aren't theirs). */
export async function draftPhotosFor(userId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(photos)
    .where(and(inArray(photos.id, ids), eq(photos.uploadedById, userId)));
}
