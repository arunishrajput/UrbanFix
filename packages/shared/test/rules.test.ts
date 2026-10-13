import { describe, expect, it } from 'vitest';
import { allowedTransitions, canTransition, statusStepIndex } from '../src/status';
import { bumpPriority, computePriority } from '../src/priority';
import { DEFAULT_VERIFICATION_SETTINGS, evaluateVerification } from '../src/verification';
import { earnedBadgeCodes, reputationLevel } from '../src/gamification';
import { formatDistance, haversineM, parseBBox } from '../src/geo';
import { hammingHex, phashSimilarity } from '../src/similarity';
import { DEFAULT_CATEGORIES } from '../src/categories';

describe('status machine', () => {
  it('lets staff progress work but not reject', () => {
    expect(canTransition('PENDING', 'IN_PROGRESS', 'STAFF')).toBe(true);
    expect(canTransition('PENDING', 'REJECTED', 'STAFF')).toBe(false);
    expect(canTransition('PENDING', 'REJECTED', 'OFFICIAL')).toBe(true);
  });
  it('reserves verification for the system (and admins)', () => {
    expect(canTransition('RESOLVED', 'VERIFIED', 'OFFICIAL')).toBe(false);
    expect(canTransition('RESOLVED', 'VERIFIED', 'system')).toBe(true);
    expect(canTransition('RESOLVED', 'REOPENED', 'system')).toBe(true);
  });
  it('never lets citizens change status', () => {
    expect(allowedTransitions('PENDING', 'CITIZEN')).toEqual([]);
  });
  it('maps reopened issues back onto the in-progress step', () => {
    expect(statusStepIndex('REOPENED')).toBe(1);
    expect(statusStepIndex('VERIFIED')).toBe(3);
  });
});

describe('computePriority', () => {
  it('starts from the category default', () => {
    expect(computePriority({ categoryDefault: 'MEDIUM', supportCount: 1, reopenedCount: 0 }).priority).toBe(
      'MEDIUM',
    );
  });
  it('raises priority for severe, well-supported, reopened issues', () => {
    expect(
      computePriority({ categoryDefault: 'MEDIUM', severity: 5, supportCount: 12, reopenedCount: 1 })
        .priority,
    ).toBe('CRITICAL');
  });
  it('lowers priority for cosmetic issues', () => {
    expect(
      computePriority({ categoryDefault: 'MEDIUM', severity: 1, supportCount: 1, reopenedCount: 0 }).priority,
    ).toBe('LOW');
  });
  it('bumps but never exceeds critical', () => {
    expect(bumpPriority('HIGH')).toBe('CRITICAL');
    expect(bumpPriority('CRITICAL')).toBe('CRITICAL');
  });
});

describe('evaluateVerification', () => {
  const s = DEFAULT_VERIFICATION_SETTINGS;
  it('reopens on any not-fixed response', () => {
    expect(evaluateVerification({ eligible: 5, resolved: 3, notFixed: 1, skipped: 0 }, s)).toBe('REOPEN');
  });
  it('verifies a single-reporter issue on one confirmation', () => {
    expect(evaluateVerification({ eligible: 1, resolved: 1, notFixed: 0, skipped: 0 }, s)).toBe('VERIFY');
  });
  it('needs two confirmations and half of the deciding citizens', () => {
    expect(evaluateVerification({ eligible: 6, resolved: 1, notFixed: 0, skipped: 0 }, s)).toBe('WAIT');
    expect(evaluateVerification({ eligible: 6, resolved: 2, notFixed: 0, skipped: 0 }, s)).toBe('WAIT');
    expect(evaluateVerification({ eligible: 6, resolved: 2, notFixed: 0, skipped: 2 }, s)).toBe('VERIFY');
    expect(evaluateVerification({ eligible: 6, resolved: 3, notFixed: 0, skipped: 0 }, s)).toBe('VERIFY');
  });
  it('resolves the round when it closes', () => {
    expect(evaluateVerification({ eligible: 6, resolved: 1, notFixed: 0, skipped: 0 }, s, true)).toBe(
      'VERIFY',
    );
    expect(evaluateVerification({ eligible: 6, resolved: 0, notFixed: 0, skipped: 0 }, s, true)).toBe(
      'EXPIRE',
    );
    expect(
      evaluateVerification(
        { eligible: 6, resolved: 0, notFixed: 0, skipped: 0 },
        { ...s, autoVerifyOnSilence: true },
        true,
      ),
    ).toBe('VERIFY');
  });
  it('expires early when everyone skipped', () => {
    expect(evaluateVerification({ eligible: 2, resolved: 0, notFixed: 0, skipped: 2 }, s)).toBe('EXPIRE');
  });
});

describe('gamification', () => {
  it('awards badges from stats', () => {
    const codes = earnedBadgeCodes({
      reportsCreated: 5,
      reportsJoined: 10,
      verifications: 0,
      issuesVerified: 0,
      eagleEyeIssues: 0,
    });
    expect(codes).toEqual(['FIRST_REPORT', 'CIVIC_STARTER', 'TEAM_PLAYER']);
  });
  it('computes levels and progress', () => {
    expect(reputationLevel(0).name).toBe('Newcomer');
    const l = reputationLevel(100);
    expect(l.name).toBe('Contributor');
    expect(l.progress).toBeCloseTo(0.5);
    expect(reputationLevel(5000).next).toBeNull();
  });
});

describe('geo + similarity helpers', () => {
  it('computes distances', () => {
    const d = haversineM({ lat: 18.5204, lng: 73.8567 }, { lat: 18.5205, lng: 73.8567 });
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(12);
    expect(formatDistance(11.4)).toBe('11 m');
    expect(formatDistance(1530)).toBe('1.5 km');
  });
  it('parses bounding boxes', () => {
    expect(parseBBox('73.8,18.5,73.9,18.6')).toEqual({ west: 73.8, south: 18.5, east: 73.9, north: 18.6 });
    expect(parseBBox('73.9,18.5,73.8,18.6')).toBeNull();
    expect(parseBBox('nope')).toBeNull();
  });
  it('compares perceptual hashes', () => {
    expect(hammingHex('ff00', 'ff01')).toBe(1);
    expect(phashSimilarity('ffffffffffffffff', 'ffffffffffffffff')).toBe(1);
  });
  it('ships the eleven default categories with valid related slugs', () => {
    const slugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
    expect(slugs.size).toBe(11);
    for (const c of DEFAULT_CATEGORIES) for (const r of c.relatedSlugs) expect(slugs.has(r)).toBe(true);
  });
});
