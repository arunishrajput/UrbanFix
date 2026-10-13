import { describe, expect, it } from 'vitest';
import {
  type DuplicateCandidate,
  type DuplicateQuery,
  duplicateHeadline,
  geoSignal,
  imageSignal,
  rankCandidates,
  scoreCandidate,
  searchRadiusM,
} from '../src/duplicates';

const now = new Date('2026-10-13T10:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

const query = (over: Partial<DuplicateQuery> = {}): DuplicateQuery => ({
  categorySlug: 'garbage',
  photos: [],
  hasText: false,
  ...over,
});

const candidate = (over: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  issueId: 'c1',
  categorySlug: 'garbage',
  relatedSlugs: ['illegal-dumping'],
  distanceM: 12,
  lastActivityAt: daysAgo(2),
  photos: [],
  ...over,
});

const opts = {
  radiusM: 50,
  now,
  categoryNames: { garbage: 'Garbage', 'illegal-dumping': 'Illegal Dumping' },
};

describe('searchRadiusM', () => {
  it('uses the category radius for a good GPS fix', () => {
    expect(searchRadiusM(50, 8)).toBe(50);
  });
  it('widens for poor accuracy and clamps', () => {
    expect(searchRadiusM(30, 60)).toBe(120);
    expect(searchRadiusM(30, 900)).toBe(250);
    expect(searchRadiusM(10, 0)).toBe(25);
    expect(searchRadiusM(null, null)).toBe(50);
  });
});

describe('geoSignal', () => {
  it('decays with distance', () => {
    expect(geoSignal(0, 50)).toBe(1);
    expect(geoSignal(12, 50)).toBeGreaterThan(0.85);
    expect(geoSignal(50, 50)).toBeLessThan(0.2);
  });
});

describe('scoreCandidate', () => {
  it('flags the same category 12 m away as a likely duplicate even before photos are analysed', () => {
    const s = scoreCandidate(query(), candidate(), opts)!;
    expect(s.level).toBe('LIKELY');
    expect(s.reasons.map((r) => r.label)).toEqual(['Same category: Garbage', '12 m away']);
  });

  it('treats the same category near the radius edge as only possible', () => {
    const s = scoreCandidate(query(), candidate({ distanceM: 40 }), opts)!;
    expect(s.level).toBe('POSSIBLE');
  });

  it('excludes an unrelated category nearby', () => {
    expect(
      scoreCandidate(query({ categorySlug: 'street-light' }), candidate({ distanceM: 5 }), opts),
    ).toBeNull();
  });

  it('keeps an unrelated category when the photo is the same image', () => {
    const photo = { sha256: 'abc', phash: 'ffff0000ffff0000' };
    const s = scoreCandidate(
      query({ categorySlug: 'street-light', photos: [photo] }),
      candidate({ distanceM: 5, photos: [photo] }),
      opts,
    );
    expect(s).not.toBeNull();
    expect(s!.reasons.some((r) => r.code === 'IDENTICAL_PHOTO')).toBe(true);
  });

  it('caps related categories below "likely" unless photos agree', () => {
    const s = scoreCandidate(query({ categorySlug: 'illegal-dumping' }), candidate({ distanceM: 5 }), opts)!;
    expect(s.level).toBe('POSSIBLE');
    expect(s.reasons[0]!.code).toBe('RELATED_CATEGORY');

    const photo = { phash: 'ffff0000ffff0000' };
    const withPhoto = scoreCandidate(
      query({ categorySlug: 'illegal-dumping', photos: [photo] }),
      candidate({ distanceM: 5, photos: [{ phash: 'ffff0000ffff0001' }] }),
      opts,
    )!;
    expect(withPhoto.level).toBe('LIKELY');
  });

  it('lowers the score when photos clearly show something different', () => {
    const withoutPhotos = scoreCandidate(query(), candidate(), opts)!;
    const differentPhotos = scoreCandidate(
      query({ photos: [{ phash: '0000000000000000' }] }),
      candidate({ photos: [{ phash: 'ffffffffffffffff' }] }),
      opts,
    )!;
    expect(differentPhotos.score).toBeLessThan(withoutPhotos.score);
  });

  it('uses the AI-predicted category when the citizen has not chosen one', () => {
    const s = scoreCandidate(
      query({ categorySlug: null, predictedCategorySlug: 'garbage' }),
      candidate(),
      opts,
    )!;
    expect(s.signals.category).toBe(1);
  });

  it('ignores missing signals instead of penalising them', () => {
    const s = scoreCandidate(query({ categorySlug: null }), candidate({ distanceM: 3 }), opts)!;
    expect(s.signals.category).toBeNull();
    expect(s.signals.image).toBeNull();
    expect(s.signals.text).toBeNull();
    expect(s.score).toBeGreaterThan(0.9);
  });

  it('adds a text reason when descriptions match', () => {
    const s = scoreCandidate(query({ hasText: true }), candidate({ trigramSimilarity: 0.55 }), opts)!;
    expect(s.reasons.some((r) => r.code === 'SIMILAR_TEXT')).toBe(true);
  });

  it('prefers recent activity', () => {
    const fresh = scoreCandidate(query(), candidate({ distanceM: 30 }), opts)!;
    const stale = scoreCandidate(query(), candidate({ distanceM: 30, lastActivityAt: daysAgo(120) }), opts)!;
    expect(fresh.score).toBeGreaterThan(stale.score);
  });
});

describe('imageSignal', () => {
  it('returns null when nothing is comparable', () => {
    expect(imageSignal([{ sha256: 'a' }], [{ sha256: 'b' }])).toBeNull();
  });
  it('uses embeddings when hashes are missing', () => {
    const v = [1, 0, 0];
    expect(imageSignal([{ embedding: v }], [{ embedding: v }])).toBe(1);
    expect(imageSignal([{ embedding: [1, 0, 0] }], [{ embedding: [0, 1, 0] }])).toBe(0);
  });
});

describe('rankCandidates', () => {
  it('drops unlikely candidates and sorts by score, then distance', () => {
    const a = scoreCandidate(query(), candidate({ issueId: 'a', distanceM: 20 }), opts);
    const b = scoreCandidate(query(), candidate({ issueId: 'b', distanceM: 5 }), opts);
    const far = scoreCandidate(query(), candidate({ issueId: 'far', distanceM: 120 }), opts);
    const ranked = rankCandidates([a, null, far, b]);
    expect(ranked.map((r) => r.issueId)).toEqual(['b', 'a']);
  });
});

describe('duplicateHeadline', () => {
  it('matches the product copy', () => {
    expect(duplicateHeadline('Garbage', 12, 'PENDING')).toBe(
      'There is already an open Garbage issue reported 12 meters away.',
    );
    expect(duplicateHeadline('Garbage', 12, 'RESOLVED')).toMatch(/still not fixed/);
  });
});
