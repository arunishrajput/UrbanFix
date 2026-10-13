/**
 * Behaviour the single-container (free-tier) deploy relies on: the API serves
 * the SPA from its own origin, and expired verification windows are settled by
 * a sweep rather than only by in-memory timers.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateIssueResult, IssueDetail } from '@urbanfix/shared';
import { db, schema } from '../../src/db/client';
import { closeExpiredRounds } from '../../src/modules/verification/service';
import { CENTER, type Fixture, setupFixture, teardown } from './harness';

let f: Fixture;
beforeAll(async () => {
  f = await setupFixture();
});
afterAll(async () => {
  await f.close();
  await teardown();
});

describe('serving the web app', () => {
  const html = { accept: 'text/html,application/xhtml+xml' };

  it('serves index.html for client-side routes', async () => {
    for (const url of ['/', '/issues/abc', '/dashboard/issues/1?tab=notes']) {
      const res = await f.app.inject({ method: 'GET', url, headers: html });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.body).toContain('<div id="root">');
    }
  });

  it('caches hashed assets for a year', async () => {
    const res = await f.app.inject({ method: 'GET', url: '/assets/app-test.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('keeps API, upload and socket paths out of the fallback', async () => {
    for (const url of ['/api/v1/nope', '/uploads/missing.webp', '/socket.io']) {
      const res = await f.app.inject({ method: 'GET', url, headers: html });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
    const asset = await f.app.inject({ method: 'GET', url: '/missing.png', headers: { accept: 'image/*' } });
    expect(asset.statusCode).toBe(404);
    expect((await f.req('GET', '/api/v1/categories')).status).toBe(200);
  });
});

describe('settling expired verification windows', () => {
  const resolveIssue = async (lng: number, joiner?: string) => {
    const alice = await f.token('alice@test.local');
    const created = await f.req<CreateIssueResult>('POST', '/api/v1/issues', {
      token: alice,
      body: {
        lat: CENTER.lat,
        lng,
        accuracyM: 5,
        categorySlug: 'street-light',
        description: 'Street light not working',
        uploadIds: [(await f.upload(alice)).id],
      },
    });
    expect(created.status).toBe(201);
    const issue = created.body.issue;
    if (joiner) {
      const tok = await f.token(joiner);
      const joined = await f.req('POST', `/api/v1/issues/${issue.id}/join`, {
        token: tok,
        body: { lat: CENTER.lat, lng, uploadIds: [(await f.upload(tok)).id] },
      });
      expect(joined.status).toBe(200);
    }
    const official = await f.token('official.a@test.local');
    const work = await f.req('POST', `/api/v1/manage/issues/${issue.id}/work-photos`, {
      token: official,
      body: { uploadIds: [(await f.upload(official, 'WORK_COMPLETION')).id] },
    });
    expect(work.status).toBe(200);
    const resolved = await f.req('POST', `/api/v1/manage/issues/${issue.id}/status`, {
      token: official,
      body: { status: 'RESOLVED' },
    });
    expect(resolved.status).toBe(200);
    return issue.id;
  };

  const expireRounds = (issueId: string) =>
    db
      .update(schema.verificationRounds)
      .set({ closesAt: sql`now() - interval '1 minute'` })
      .where(eq(schema.verificationRounds.issueId, issueId));

  const getIssue = async (id: string) => (await f.req<IssueDetail>('GET', `/api/v1/issues/${id}`)).body;

  it('verifies a confirmed issue once its window has passed', async () => {
    const id = await resolveIssue(CENTER.lng + 0.002, 'bob@test.local');
    const confirm = await f.req<{ decision: string }>('POST', `/api/v1/issues/${id}/verification`, {
      token: await f.token('alice@test.local'),
      body: { response: 'RESOLVED' },
    });
    expect(confirm.body.decision).toBe('WAIT');

    await closeExpiredRounds();
    expect((await getIssue(id)).status).toBe('RESOLVED'); // window still open

    await expireRounds(id);
    await closeExpiredRounds();
    const issue = await getIssue(id);
    expect(issue.status).toBe('VERIFIED');
    expect(issue.verificationRounds[0]!.outcome).toBe('VERIFIED');
  });

  it('expires a round nobody answered and leaves the issue resolved', async () => {
    const id = await resolveIssue(CENTER.lng - 0.002);
    await expireRounds(id);
    await closeExpiredRounds();
    const issue = await getIssue(id);
    expect(issue.status).toBe('RESOLVED');
    expect(issue.verificationRounds[0]!.outcome).toBe('EXPIRED');

    await closeExpiredRounds(); // idempotent
    expect((await getIssue(id)).verificationRounds[0]!.outcome).toBe('EXPIRED');
  });
});
