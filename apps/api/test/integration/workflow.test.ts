import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthResponse,
  CreateIssueResult,
  DuplicateCheckResult,
  IssueDetail,
  JoinIssueResult,
  ManageIssueDetail,
  NotificationDTO,
  Paginated,
} from '@urbanfix/shared';
import { CENTER, type Fixture, setupFixture, teardown } from './harness';

let f: Fixture;
beforeAll(async () => {
  f = await setupFixture();
});
afterAll(async () => {
  await f.close();
  await teardown();
});

/** ~12 m north of the centre. */
const near = { lat: CENTER.lat + 0.000108, lng: CENTER.lng };

describe('auth', () => {
  it('registers, rotates refresh tokens and detects reuse', async () => {
    const reg = await f.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { name: 'Dev Patel', email: 'dev@test.local', password: 'abc12345' },
    });
    expect(reg.statusCode).toBe(201);
    const cookie = reg.cookies.find((c) => c.name === 'uf_refresh')!;
    expect(cookie.httpOnly).toBe(true);

    const refresh = (value: string) =>
      f.app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'x-requested-with': 'urbanfix' },
        cookies: { uf_refresh: value },
      });
    const first = await refresh(cookie.value);
    expect(first.statusCode).toBe(200);
    const rotated = first.cookies.find((c) => c.name === 'uf_refresh')!.value;
    expect(rotated).not.toBe(cookie.value);

    // Replaying the old token revokes the whole family, including the rotated one.
    expect((await refresh(cookie.value)).statusCode).toBe(401);
    expect((await refresh(rotated)).statusCode).toBe(401);
  });

  it('requires the CSRF header on refresh', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { uf_refresh: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects wrong passwords without revealing whether the email exists', async () => {
    const a = await f.req<{ error: { code: string } }>('POST', '/api/v1/auth/login', {
      body: { email: 'alice@test.local', password: 'nope1234' },
    });
    const b = await f.req<{ error: { code: string } }>('POST', '/api/v1/auth/login', {
      body: { email: 'ghost@test.local', password: 'nope1234' },
    });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.code).toBe(b.body.error.code);
  });

  it('upgrades a guest to a full account keeping its identity', async () => {
    const guest = await f.req<AuthResponse>('POST', '/api/v1/auth/guest', { body: {} });
    expect(guest.body.user.isGuest).toBe(true);
    const up = await f.req<AuthResponse>('POST', '/api/v1/auth/upgrade', {
      token: guest.body.accessToken,
      body: { name: 'Former Guest', email: 'former@test.local', password: 'abc12345' },
    });
    expect(up.status).toBe(200);
    expect(up.body.user.id).toBe(guest.body.user.id);
    expect(up.body.user.isGuest).toBe(false);
  });
});

describe('uploads', () => {
  it('rejects files that are not images', async () => {
    const tok = await f.token('alice@test.local');
    const boundary = 'xyz';
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: {
        authorization: `Bearer ${tok}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\nnot an image\r\n--${boundary}--\r\n`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('processes photos into variants with hashes and heuristic analysis', async () => {
    const tok = await f.token('alice@test.local');
    const up = await f.upload(tok);
    const res = await f.req<{
      thumbUrl: string;
      thumbhash: string;
      analysisStatus: string;
      analysis: { source: string };
    }>('GET', `/api/v1/uploads/${up.id}`, { token: tok });
    expect(res.body.thumbUrl).toMatch(/thumb\.webp$/);
    expect(res.body.thumbhash).toBeTruthy();
    expect(res.body.analysisStatus).toBe('SKIPPED');
    expect(res.body.analysis.source).toBe('heuristic');
  });

  it('only lets staff upload work-completion photos', async () => {
    const tok = await f.token('alice@test.local');
    await expect(f.upload(tok, 'WORK_COMPLETION')).rejects.toThrow(/403|staff/i);
  });
});

describe('duplicate detection, joining and the resolution workflow', () => {
  let issue: IssueDetail;

  it('creates the first issue and assigns it to the containing ward', async () => {
    const alice = await f.token('alice@test.local');
    const photo = await f.upload(alice);
    const res = await f.req<CreateIssueResult>('POST', '/api/v1/issues', {
      token: alice,
      body: {
        ...CENTER,
        accuracyM: 6,
        categorySlug: 'garbage',
        description: 'Bin overflowing near the bakery',
        uploadIds: [photo.id],
      },
    });
    expect(res.status).toBe(201);
    issue = res.body.issue;
    expect(issue.ref).toMatch(/^UF-\d{6}$/);
    expect(issue.ward?.id).toBe(f.wards.a);
    expect(issue.status).toBe('PENDING');
    expect(issue.supportCount).toBe(1);
  });

  it('finds it as a likely duplicate 12 m away', async () => {
    const bob = await f.token('bob@test.local');
    const res = await f.req<DuplicateCheckResult>('POST', '/api/v1/issues/duplicates/check', {
      token: bob,
      body: { ...near, accuracyM: 8, categorySlug: 'garbage' },
    });
    expect(res.body.headline).toBe('There is already an open Garbage issue reported 12 meters away.');
    expect(res.body.candidates[0]!.issue.id).toBe(issue.id);
    expect(res.body.candidates[0]!.level).toBe('LIKELY');
    expect(res.body.blocking).toBe(true);
  });

  it('does not match an unrelated category at the same spot', async () => {
    const bob = await f.token('bob@test.local');
    const res = await f.req<DuplicateCheckResult>('POST', '/api/v1/issues/duplicates/check', {
      token: bob,
      body: { ...near, categorySlug: 'street-light' },
    });
    expect(res.body.candidates).toHaveLength(0);
  });

  it('refuses to create a duplicate until the citizen dismisses the match', async () => {
    const bob = await f.token('bob@test.local');
    const photo = await f.upload(bob);
    const blocked = await f.req<{ error: { code: string; details: DuplicateCheckResult } }>(
      'POST',
      '/api/v1/issues',
      {
        token: bob,
        body: { ...near, categorySlug: 'garbage', uploadIds: [photo.id] },
      },
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DUPLICATE_SUSPECTED');
    expect(blocked.body.error.details.candidates[0]!.issue.id).toBe(issue.id);
  });

  it('joins the existing issue as a second reporter', async () => {
    const bob = await f.token('bob@test.local');
    const photo = await f.upload(bob);
    const res = await f.req<JoinIssueResult>('POST', `/api/v1/issues/${issue.id}/join`, {
      token: bob,
      body: { ...near, description: 'Still there', uploadIds: [photo.id] },
    });
    expect(res.status).toBe(200);
    expect(res.body.issue.supportCount).toBe(2);
    expect(res.body.issue.reporterCount).toBe(2);
    expect(res.body.issue.reportCount).toBe(2);
    expect(res.body.issue.viewer.isReporter).toBe(true);

    const again = await f.req('POST', `/api/v1/issues/${issue.id}/join`, {
      token: bob,
      body: { ...near, uploadIds: [(await f.upload(bob)).id] },
    });
    expect(again.status).toBe(409);
  });

  it('lets a citizen who dismissed the match create a genuinely new issue', async () => {
    const carol = await f.token('carol@test.local');
    const photo = await f.upload(carol);
    const res = await f.req<CreateIssueResult>('POST', '/api/v1/issues', {
      token: carol,
      body: { ...near, categorySlug: 'garbage', uploadIds: [photo.id], dismissedCandidateIds: [issue.id] },
    });
    expect(res.status).toBe(201);
    expect(res.body.issue.id).not.toBe(issue.id);
  });

  it('notifies the ward official of new issues', async () => {
    const official = await f.token('official.a@test.local');
    const res = await f.req<Paginated<NotificationDTO>>('GET', '/api/v1/notifications', { token: official });
    expect(res.body.items.some((n) => n.type === 'ISSUE_NEW_IN_WARD' && n.issueId === issue.id)).toBe(true);
    expect(res.body.items.some((n) => n.type === 'REPORT_JOINED' && n.issueId === issue.id)).toBe(true);
  });

  it('enforces the status machine and requires a work photo before resolving', async () => {
    const official = await f.token('official.a@test.local');
    const staff = await f.token('staff.a@test.local');
    const staffList = await f.req<{ id: string; name: string }[]>('GET', '/api/v1/manage/staff', {
      token: official,
    });
    const staffId = staffList.body.find((s) => s.name.startsWith('staff'))!.id;

    expect(
      (
        await f.req('POST', `/api/v1/manage/issues/${issue.id}/assign`, {
          token: staff,
          body: { assigneeId: staffId },
        })
      ).status,
    ).toBe(403);
    const assigned = await f.req<ManageIssueDetail>('POST', `/api/v1/manage/issues/${issue.id}/assign`, {
      token: official,
      body: { assigneeId: staffId },
    });
    expect(assigned.body.assignee?.id).toBe(staffId);

    const verifyEarly = await f.req('POST', `/api/v1/manage/issues/${issue.id}/status`, {
      token: official,
      body: { status: 'VERIFIED' },
    });
    expect(verifyEarly.status).toBe(422);

    const started = await f.req<ManageIssueDetail>('POST', `/api/v1/manage/issues/${issue.id}/status`, {
      token: staff,
      body: { status: 'IN_PROGRESS' },
    });
    expect(started.body.status).toBe('IN_PROGRESS');

    const noPhoto = await f.req('POST', `/api/v1/manage/issues/${issue.id}/status`, {
      token: staff,
      body: { status: 'RESOLVED' },
    });
    expect(noPhoto.status).toBe(400);

    const work = await f.upload(staff, 'WORK_COMPLETION');
    await f.req('POST', `/api/v1/manage/issues/${issue.id}/work-photos`, {
      token: staff,
      body: { uploadIds: [work.id] },
    });
    const resolved = await f.req<ManageIssueDetail>('POST', `/api/v1/manage/issues/${issue.id}/status`, {
      token: staff,
      body: { status: 'RESOLVED' },
    });
    expect(resolved.body.status).toBe('RESOLVED');
    expect(resolved.body.verificationRounds[0]).toMatchObject({ outcome: 'PENDING', eligibleCount: 2 });
  });

  it('asks every reporter to verify, and reopens on "still not fixed"', async () => {
    const alice = await f.token('alice@test.local');
    const bob = await f.token('bob@test.local');
    const notes = await f.req<Paginated<NotificationDTO>>('GET', '/api/v1/notifications', { token: bob });
    expect(notes.body.items.some((n) => n.type === 'VERIFICATION_REQUEST' && n.issueId === issue.id)).toBe(
      true,
    );

    const noPhoto = await f.req('POST', `/api/v1/issues/${issue.id}/verification`, {
      token: bob,
      body: { response: 'NOT_FIXED' },
    });
    expect(noPhoto.status).toBe(400);

    const confirm = await f.req<{ decision: string }>('POST', `/api/v1/issues/${issue.id}/verification`, {
      token: alice,
      body: { response: 'RESOLVED' },
    });
    expect(confirm.body.decision).toBe('WAIT');

    const evidence = await f.upload(bob, 'VERIFICATION');
    const reopen = await f.req<{ decision: string; status: string; issue: IssueDetail }>(
      'POST',
      `/api/v1/issues/${issue.id}/verification`,
      {
        token: bob,
        body: { response: 'NOT_FIXED', comment: 'Overflowing again', uploadIds: [evidence.id] },
      },
    );
    expect(reopen.body.decision).toBe('REOPEN');
    expect(reopen.body.issue.status).toBe('REOPENED');
    expect(reopen.body.issue.reopenedCount).toBe(1);

    const official = await f.token('official.a@test.local');
    const offNotes = await f.req<Paginated<NotificationDTO>>('GET', '/api/v1/notifications', {
      token: official,
    });
    expect(offNotes.body.items.some((n) => n.type === 'ISSUE_REOPENED' && n.issueId === issue.id)).toBe(true);
  });

  it('verifies once enough reporters confirm the second fix', async () => {
    const staff = await f.token('staff.a@test.local');
    const work = await f.upload(staff, 'WORK_COMPLETION');
    await f.req('POST', `/api/v1/manage/issues/${issue.id}/work-photos`, {
      token: staff,
      body: { uploadIds: [work.id] },
    });
    await f.req('POST', `/api/v1/manage/issues/${issue.id}/status`, {
      token: staff,
      body: { status: 'RESOLVED' },
    });

    for (const email of ['alice@test.local', 'bob@test.local']) {
      await f.req('POST', `/api/v1/issues/${issue.id}/verification`, {
        token: await f.token(email),
        body: { response: 'RESOLVED' },
      });
    }
    const final = await f.req<IssueDetail>('GET', `/api/v1/issues/${issue.id}`);
    expect(final.body.status).toBe('VERIFIED');
    expect(final.body.verificationRounds.map((r) => r.outcome)).toEqual(['VERIFIED', 'REOPENED']);

    const timeline = await f.req<{ items: { type: string; isInternal: boolean }[] }>(
      'GET',
      `/api/v1/issues/${issue.id}/timeline`,
    );
    expect(timeline.body.items.map((e) => e.type)).toEqual(
      expect.arrayContaining(['CREATED', 'REPORT_JOINED', 'ASSIGNED', 'REOPENED', 'VERIFIED']),
    );
    expect(timeline.body.items.every((e) => !e.isInternal)).toBe(true);
  });

  it('awards reputation to the reporters', async () => {
    const res = await f.req<{ stats: { reputation: number; reportsCreated: number } }>(
      'GET',
      '/api/v1/me/profile',
      {
        token: await f.token('alice@test.local'),
      },
    );
    expect(res.body.stats.reportsCreated).toBe(1);
    expect(res.body.stats.reputation).toBeGreaterThanOrEqual(10 + 3 + 15);
  });
});

describe('access control', () => {
  it('keeps citizens out of municipal and admin APIs', async () => {
    const alice = await f.token('alice@test.local');
    expect((await f.req('GET', '/api/v1/manage/issues', { token: alice })).status).toBe(403);
    expect((await f.req('GET', '/api/v1/admin/users', { token: alice })).status).toBe(403);
    expect((await f.req('GET', '/api/v1/analytics/overview', { token: alice })).status).toBe(403);
    expect((await f.req('GET', '/api/v1/manage/issues')).status).toBe(401);
  });

  it('scopes ward officials to their own ward', async () => {
    const officialB = await f.token('official.b@test.local');
    const list = await f.req<{ items: unknown[]; total: number }>('GET', '/api/v1/manage/issues', {
      token: officialB,
    });
    expect(list.body.total).toBe(0);
    const anyIssue = (await f.req<Paginated<{ id: string }>>('GET', '/api/v1/issues')).body.items[0]!;
    expect((await f.req('GET', `/api/v1/manage/issues/${anyIssue.id}`, { token: officialB })).status).toBe(
      404,
    );
  });

  it('lets admins see everything and records an audit trail', async () => {
    const admin = await f.token('admin@test.local');
    const list = await f.req<{ total: number }>('GET', '/api/v1/manage/issues', { token: admin });
    expect(list.body.total).toBeGreaterThanOrEqual(2);
    const audit = await f.req<{ items: { action: string }[] }>('GET', '/api/v1/admin/audit-logs', {
      token: admin,
    });
    expect(audit.body.items.map((a) => a.action)).toEqual(
      expect.arrayContaining(['issue.assign', 'issue.status']),
    );
  });

  it('returns analytics for officials', async () => {
    const official = await f.token('official.a@test.local');
    const res = await f.req<{ totalIssues: number; joinRate: number }>('GET', '/api/v1/analytics/overview', {
      token: official,
    });
    expect(res.status).toBe(200);
    expect(res.body.totalIssues).toBe(2);
    expect(res.body.joinRate).toBeGreaterThan(0);
  });
});
