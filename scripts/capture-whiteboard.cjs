const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const EMAIL = `cap_${Date.now()}@ocean.test`;
const PASS = 'CapTest123!';
const DIR = 'G:/OnmiRouter-Test/Ocean-V1 - Copy';
const log = (s) => { try { process.stderr.write(s + '\n'); } catch {} };

(async () => {
  const api = async (path, body) =>
    (await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  try { await api('/api/auth/signup', { name: 'Cap', email: EMAIL, password: PASS, countryCode: 'bd' }); } catch {}
  await new Promise(r => setTimeout(r, 1200));

  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const jsErrors = [];
  p.on('pageerror', (e) => jsErrors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') jsErrors.push('console: ' + m.text()); });

  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  log('body start: ' + (await p.evaluate(() => document.body.innerText.slice(0, 200))).replace(/\n/g, ' | '));
  await p.screenshot({ path: DIR + '/smoke-01-auth-gate.png' });

  // UI login: email → password → submit.
  await p.locator('input[type="email"]').first().fill(EMAIL, { timeout: 10000 }).catch((e) => { log('email fill err: ' + e.message); });
  await p.locator('input[type="password"]').first().fill(PASS, { timeout: 5000 }).catch((e) => { log('pass fill err: ' + e.message); });
  await p.locator('button[type="submit"]').filter({ hasText: 'Unlock Workspace' }).first().click({ timeout: 5000 }).catch((e) => { log('submit click err: ' + e.message); });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: DIR + '/smoke-02-after-login.png' });
  log('after login body: ' + (await p.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\n/g, ' | '));

  // Check if we're on the feed (has Feed nav button or post composer area).
  const hasNav = await p.locator('button[title="View Posts Feed"]').count();
  log('Feed nav button: ' + hasNav);

  // Expand the bottom nav so the composer ("Create a new post") button appears.
  const unfold = p.locator('button[title="Unfold Menu"]');
  log('unfold btn count: ' + (await unfold.count()));
  if (await unfold.count() > 0) {
    await unfold.first().click({ force: true, timeout: 6000 }).catch((e) => log('unfold err: ' + e.message));
    await p.waitForTimeout(1000);
  }

  // Open the composer.
  const createBtn = p.locator('button[title="Create a new post"]');
  log('create post btn count (after unfold): ' + (await createBtn.count()));
  if (await createBtn.count() > 0) {
    await createBtn.first().click({ force: true, timeout: 6000 });
    await p.waitForTimeout(2000);
    await p.screenshot({ path: DIR + '/smoke-03-composer.png' });
    log('Create Studio: ' + (await p.getByText('Create Studio').first().isVisible({ timeout:5000 }).then(() => true).catch(() => false)));
    log('Design btn: ' + (await p.locator('button[title*="design"]').count()));
    log('Board btn: ' + (await p.locator('button[title*="Whiteboard"]').count()));
    log('Story btn: ' + (await p.locator('button[title*="story"]').count()));
    log('Cut btn: ' + (await p.locator('button[title*="FFmpeg"], button[title*="video"]').count()));
    log('image input: ' + (await p.locator('input[type=file][accept="image/*"]').count()));

    // Open whiteboard
    const wbBtn = p.locator('button[title*="Whiteboard"]');
    if (await wbBtn.count() > 0) {
      await wbBtn.first().click({ timeout: 6000 }).catch((e) => log('wb click err: ' + e.message));
      await p.waitForTimeout(6000);
      await p.screenshot({ path: DIR + '/smoke-04-whiteboard.png' });
      const wbInfo = await p.evaluate(() => ({
        hasCanvas: document.querySelectorAll('canvas').length,
        hasTl: document.querySelectorAll('[class*="tl-"]').length,
        title: document.body.innerText.includes('Ocean Whiteboard'),
        toolbar: document.querySelectorAll('[class*="tlui"]').length,
      }));
      log('tldraw dom: ' + JSON.stringify(wbInfo));
      await p.keyboard.press('Escape').catch(() => {});
      await p.waitForTimeout(1000);
    }
  }

  log('JS errors: ' + jsErrors.slice(0, 10).join(' || '));
  await b.close();
  log('DONE');
})().catch((e) => { log('FATAL: ' + e.message); process.exit(1); });