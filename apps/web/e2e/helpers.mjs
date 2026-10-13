/**
 * Shared helpers for the browser smoke tests: launches Chromium, mocks
 * geolocation, and serves placeholder map tiles so runs work offline.
 */
import { chromium } from 'playwright-core';

export const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
export const PASSWORD = 'urbanfix123';

// A 256×256 neutral tile with faint "streets", so maps render without network access.
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="256" height="256" fill="#e9ebe6"/>
  <path d="M0 96H256M0 200H256M70 0V256M180 0V256" stroke="#ffffff" stroke-width="10"/>
  <path d="M0 40L256 150" stroke="#f7f7f4" stroke-width="6"/>
  <rect x="96" y="120" width="60" height="50" fill="#dfe6d8"/>
</svg>`;

export async function launch({
  executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
} = {}) {
  return chromium.launch({ executablePath, args: ['--no-sandbox'] });
}

export async function newContext(
  browser,
  { mobile = false, dark = false, geo = { latitude: 18.52315, longitude: 73.8413, accuracy: 8 } } = {},
) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: dark ? 'dark' : 'light',
    geolocation: geo,
    permissions: ['geolocation', 'notifications'],
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });
  await context.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TILE_SVG }),
  );
  await context.addInitScript(
    (theme) => {
      try {
        localStorage.setItem('uf-theme', theme);
      } catch {
        /* ignore */
      }
    },
    dark ? 'dark' : 'light',
  );
  return context;
}

export function trackErrors(page, sink) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (err) => sink.push(`[pageerror] ${err.message}`));
}

export async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
