/* eslint-disable no-console */
// Ocean editor engines — Playwright smoke test (fast, stderr-flushed).
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const EMAIL = `smoke_${Date.now()}@ocean.test`;
const PASS = 'SmokeTest123!';
const log = (s) => { try { process.stderr.write(s + '\n'); } catch {} };

(async () => {
  const api = async (path, body) => {
    const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  };
  try {
    await api('/api/auth/signup', { name: 'Smoke Tester', email: EMAIL, password: PASS, countryCode: 'bd' });
  } catch (e) { log('signup fetch err ' + e.message); }
  const login = await api('/api/auth/login', { email: EMAIL, password: PASS });
  log('login token: ' + (login.token ? 'YES' : 'NO ' + JSON.stringify(login).slice(0, 120)));

  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') jsErrors.push('console: ' + m.text()); });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate((t) => { try { localStorage.setItem('turtle_auth_token', t); localStorage.setItem('user_portfolio_profile', JSON.stringify({ name: 'Smoke Tester', avatarUrl: '' })); } catch {} }, login.token);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: '/tmp/smoke_landing.png' });
    log('landed, content len=' + (await page.content()).length);

    // Feed nav
    try { await page.getByTitle(/View Posts Feed/i).first().click({ timeout: 8000 }); } catch (e) { log('feed nav click skipped'); }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '/tmp/smoke_feed.png' });

    // Composer
    try { await page.getByText(/What.*on.*mind|Create a post|Post Something/i).first().click({ timeout: 8000 }); } catch {}
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/smoke_composer.png' });

    const studioVisible = await page.getByText('Create Studio').first().isVisible({ timeout: 5000 }).then(() => true).catch(() => false);
    log('Create Studio row: ' + (studioVisible ? 'VISIBLE' : 'NOT FOUND'));

    const imageInputs = await page.locator('input[type=file][accept="image/*"]').count();
    log('image inputs: ' + imageInputs);

    if (studioVisible) {
      // Whiteboard (tldraw)
      await page.getByText('Board', { exact: true }).first().click({ timeout: 6000 }).catch((e) => log('board click err ' + e.message));
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/tmp/smoke_whiteboard.png' });
      const wb = await page.getByText('Ocean Whiteboard').first().isVisible({ timeout: 8000 }).then(() => true).catch(() => false);
      log('whiteboard launched: ' + wb);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  } catch (err) {
    log('SMOKE ERROR: ' + err.message);
  }
  await page.screenshot({ path: '/tmp/smoke_final.png' }).catch(() => {});
  await browser.close();
  log('JS errors: ' + (jsErrors.length ? jsErrors.slice(0, 15).join(' || ') : 'none'));
  log('SMOKE DONE');
})();