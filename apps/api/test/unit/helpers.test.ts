import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '@urbanfix/shared';
import { fallbackTitle, heuristicAnalysis, predictCategoryFromText } from '../../src/modules/ai/heuristics';
import { shortAddress } from '../../src/modules/geo/service';
import { decodeCursor, encodeCursor, formatRef, initials, parseRef, publicName } from '../../src/lib/format';

describe('category heuristics', () => {
  it('understands English and Hinglish keywords', () => {
    expect(predictCategoryFromText('Huge pothole near the signal', DEFAULT_CATEGORIES)?.slug).toBe(
      'road-pothole',
    );
    expect(predictCategoryFromText('kachra pada hai road pe', DEFAULT_CATEGORIES)?.slug).toBe('garbage');
    expect(predictCategoryFromText('naali overflow ho rahi hai', DEFAULT_CATEGORIES)?.slug).toBe(
      'broken-drain',
    );
    expect(predictCategoryFromText('lorem ipsum', DEFAULT_CATEGORIES)).toBeNull();
  });

  it('marks heuristic analyses as unscreened', () => {
    const a = heuristicAnalysis(DEFAULT_CATEGORIES, 'street light not working');
    expect(a.source).toBe('heuristic');
    expect(a.categorySlug).toBe('street-light');
    expect(a.moderation.flags).toContain('unscreened');
  });

  it('builds a readable fallback title', () => {
    expect(fallbackTitle('Garbage', '12 MG Road, Camp, Pune')).toBe('Garbage near 12 MG Road');
    expect(fallbackTitle('Garbage', null)).toBe('Garbage reported');
  });
});

describe('formatting helpers', () => {
  it('formats and parses complaint numbers', () => {
    expect(formatRef(42)).toBe('UF-000042');
    expect(parseRef('uf-000042')).toBe(42);
    expect(parseRef('42')).toBe(42);
    expect(parseRef('abc')).toBeNull();
  });

  it('anonymises reporter names', () => {
    expect(publicName('Priya Sharma', false)).toBe('Priya S.');
    expect(publicName('Guest', true)).toBe('Guest citizen');
    expect(initials('Priya Sharma')).toBe('PS');
  });

  it('round-trips cursors and ignores garbage', () => {
    expect(decodeCursor(encodeCursor(['2026-01-01', 'x']))).toEqual(['2026-01-01', 'x']);
    expect(decodeCursor('%%%')).toBeNull();
  });

  it('shortens Nominatim addresses', () => {
    expect(
      shortAddress({ house_number: '12', road: 'FC Road', suburb: 'Shivajinagar', city: 'Pune' }, 'x'),
    ).toBe('12, FC Road, Shivajinagar, Pune');
  });
});
