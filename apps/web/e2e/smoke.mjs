/**
 * End-to-end smoke test of the core civic loop, in a real browser:
 *
 *   1. A guest reports garbage 12 m from an existing open garbage issue.
 *   2. Duplicate detection shows the existing issue; the guest joins it.
 *   3. The ward official starts work, uploads a completion photo, resolves it.
 *   4. The guest is asked to verify, answers "Still not fixed" with a photo.
 *   5. The issue is reopened and the official is notified in real time.
 *
 * Needs the API (+ worker, or JOBS_MODE=inline) and web dev server running on
 * a freshly seeded database (`pnpm db:reset`). Optional: `--screenshots <dir>`.
 *
 *   pnpm test:e2e
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, launch, login, newContext, trackErrors } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);
const shotsArg = process.argv.indexOf('--screenshots');
const shotsDir = shotsArg > 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const errors = [];
let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);
const shot = async (page, name, opts = {}) => {
  if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name}.png`), ...opts });
};
function expect(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

const browser = await launch();
try {
  console.log(`UrbanFix smoke test against ${BASE}`);

  /* ---------- citizen (guest) ---------- */
  const citizenCtx = await newContext(browser, { mobile: true });
  const citizen = await citizenCtx.newPage();
  trackErrors(citizen, errors);
  await citizen.goto(`${BASE}/`);
  await citizen.getByRole('heading', { name: /Report it in a minute/ }).waitFor();
  await citizen.waitForTimeout(1500);
  await shot(citizen, 'home-mobile');
  ok('home page renders');

  await citizen.goto(`${BASE}/report`);
  await citizen.locator('input[type=file]:not([capture])').setInputFiles(fixture('garbage.jpg'));
  await citizen.getByText('Uploading').waitFor({ state: 'detached', timeout: 30_000 });
  // AI analysis is optional: with no key the heuristic path is used and the citizen picks the category.
  await citizen
    .getByText(/Looks like|Analysing/)
    .first()
    .waitFor({ timeout: 5_000 })
    .catch(() => {});
  await citizen
    .getByText('Analysing')
    .waitFor({ state: 'detached', timeout: 60_000 })
    .catch(() => {});
  await shot(citizen, 'report-photo');
  await citizen.getByRole('button', { name: /^Continue/ }).click();
  ok('photo uploaded as a guest (session created automatically)');

  await citizen.getByText(/±\d+ m/).waitFor({ timeout: 15_000 });
  await citizen.waitForTimeout(800);
  await shot(citizen, 'report-location');
  await citizen.getByRole('button', { name: /^Continue/ }).click();
  ok('GPS location captured');

  await citizen.getByRole('radio', { name: /Garbage/ }).click();
  await shot(citizen, 'report-category');
  await citizen.getByRole('button', { name: /^Continue/ }).click();
  await citizen.getByRole('button', { name: /Check & continue/ }).click();
  await citizen.getByText('Before you submit').waitFor({ timeout: 15_000 });
  const headline = await citizen
    .getByText(/There is already an open Garbage issue reported \d+ meters away\./)
    .textContent();
  expect(headline, 'duplicate headline is shown');
  await citizen.waitForTimeout(1000);
  await shot(citizen, 'report-duplicates');
  ok(`duplicate detected: “${headline.trim()}”`);

  await citizen.getByRole('button', { name: 'Join this issue' }).first().click();
  await citizen.getByText('You joined this issue').waitFor({ timeout: 15_000 });
  const ref = (await citizen.locator('dd.font-mono').first().textContent()).trim();
  await citizen.waitForTimeout(1200);
  await shot(citizen, 'report-receipt', { fullPage: true });
  ok(`joined existing issue ${ref} instead of filing a duplicate`);

  await citizen.getByRole('link', { name: 'Track this issue' }).click();
  await citizen.waitForURL(/\/issues\//);
  const issueUrl = citizen.url();
  const issueId = issueUrl.split('/issues/')[1];
  await citizen.getByRole('button', { name: /You reported this/ }).waitFor();
  ok('issue page shows the guest as a reporter');

  /* ---------- official ---------- */
  const officialCtx = await newContext(browser);
  const official = await officialCtx.newPage();
  trackErrors(official, errors);
  await login(official, 'official.shivajinagar@urbanfix.local');
  await official.waitForURL(/\/dashboard/);
  await official.waitForTimeout(1500);
  await shot(official, 'dashboard');
  await official.goto(`${BASE}/dashboard/issues/${issueId}`);
  await official.getByRole('heading', { level: 1 }).waitFor();

  const startWork = official.getByRole('button', { name: 'Start work' });
  if (await startWork.isVisible()) {
    await startWork.click();
    await official.getByRole('button', { name: 'Confirm' }).click();
    await official.getByRole('button', { name: 'Confirm' }).waitFor({ state: 'detached' });
    await startWork.waitFor({ state: 'detached' });
  }
  await official.locator('input[type=file][multiple]').setInputFiles(fixture('work-done.jpg'));
  await official.getByText('Work photos added').waitFor({ timeout: 30_000 });
  await official.getByRole('button', { name: 'Mark resolved' }).click();
  await official.getByRole('button', { name: 'Confirm' }).click();
  await official.getByText('Waiting for citizens to verify the fix.').waitFor({ timeout: 15_000 });
  await official.waitForTimeout(800);
  await shot(official, 'manage-issue', { fullPage: true });
  ok('official started work, added a completion photo and resolved it');

  /* ---------- verification ---------- */
  await citizen.goto(`${BASE}/verify/${issueId}`);
  await citizen.getByRole('radio', { name: /Still not fixed/ }).click();
  await citizen.locator('input[type=file][capture]').setInputFiles(fixture('garbage.jpg'));
  await citizen.getByRole('button', { name: 'Reopen this issue' }).waitFor();
  await citizen.waitForTimeout(1500);
  await citizen.getByLabel(/What is still wrong/).fill('Bin is overflowing again this morning.');
  await shot(citizen, 'verify', { fullPage: true });
  const reopenedToast = official.getByText('Issue reopened').first();
  await citizen.getByRole('button', { name: 'Reopen this issue' }).click();
  await citizen.getByText('Reopened. Officials have been notified.').waitFor({ timeout: 15_000 });
  ok('citizen answered “Still not fixed” with a photo → issue reopened');

  await reopenedToast.waitFor({ timeout: 15_000 });
  ok('official received the reopen notification in real time');

  await official.goto(`${BASE}/dashboard/analytics`);
  await official.getByRole('heading', { name: 'Analytics' }).waitFor();
  await official.waitForTimeout(2500);
  await shot(official, 'analytics', { fullPage: true });
  ok('analytics dashboard renders');

  if (shotsDir) {
    await citizen.goto(`${BASE}/map`);
    await citizen.waitForTimeout(2500);
    await shot(citizen, 'map-mobile');
    await official.goto(issueUrl);
    await official.waitForTimeout(2500);
    await shot(official, 'issue', { fullPage: true });
    const dark = await newContext(browser, { mobile: true, dark: true });
    const d = await dark.newPage();
    await login(d, 'citizen@urbanfix.local');
    await d.goto(`${BASE}/me`);
    await d.waitForTimeout(2500);
    await shot(d, 'profile-dark');
  }

  const real = errors.filter((e) => !/Failed to load resource/.test(e));
  expect(real.length === 0, `no browser errors (got: ${real.join(' | ')})`);
  ok('no console errors');
  console.log(`\nAll ${step} checks passed.`);
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  if (errors.length) console.error('Browser errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
