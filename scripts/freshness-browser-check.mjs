// Real Chromium UI and lifecycle checks. Run headed under xvfb for real tab visibility.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd(), key = 'coldpause-session-v1', passed = [], history = [];
const output = 'evidence/freshness';
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://local').pathname;
  const target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!target.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const content = await readFile(target);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(target)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch { res.writeHead(404); res.end('missing'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: process.env.COLDPAUSE_HEADED !== '1', ignoreDefaultArgs: ['--disable-back-forward-cache'] });
let page;
const saved = p => p.evaluate(k => localStorage.getItem(k), key);
const visible = (p, state) => p.waitForFunction(state => document.visibilityState === state, state, { polling: 50 });
async function nativeVisibility(p) {
  // Playwright 1.56.1 crPage.ts enables this override for every new page. Turn
  // it off so tab switches exercise real browser visibility, not fake focus.
  const session = await p.context().newCDPSession(p);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
}
const title = p => p.locator('#result-title').textContent();
async function seed(p, minutes = '180') {
  await p.locator('#food').selectOption('milk');
  await p.locator('[name="durationKnown"][value="known"]').check();
  await p.locator('#outageMinutes').fill(minutes);
  await p.locator('#doors').selectOption('closed');
  await p.locator('#initialCold').selectOption('yes');
  await p.locator('#coldSource').selectOption('no');
  await p.locator('#spoilage').selectOption('no');
}
async function submit(p) {
  await p.locator('button[type="submit"]').focus(); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('#session-status').textContent.startsWith('Choices saved'));
}
async function awayAndBack(p, other) {
  await other.bringToFront(); await visible(p, 'hidden');
  await p.bringToFront(); await visible(p, 'visible');
}
try {
  for (const [label, width, height] of [['desktop', 1280, 900], ['narrow', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(String(e))));
    await context.addInitScript(() => window.addEventListener('pageshow', e => { window.lastPersistedShow = e.persisted; }));
    page = await context.newPage(); await page.goto(url); await nativeVisibility(page); await seed(page); await submit(page);
    assert.equal(await title(page), 'Within the general closed-door window');
    await page.locator('#outageMinutes').focus();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await title(page), 'Within the general closed-door window');
    const before = await saved(page);
    const other = await context.newPage(); await other.goto('about:blank'); await nativeVisibility(other);
    await awayAndBack(page, other);
    assert.equal(await title(page), 'Check your facts after returning');
    assert.equal(await page.locator('#outageMinutes').inputValue(), '180');
    assert.equal(await saved(page), before);
    assert.equal(await page.locator('#outageMinutes').evaluate(e => e === document.activeElement), true);
    assert.equal(await page.locator('#fact-check-note').isVisible(), true);
    assert.match(await page.locator('#result').textContent(), /not a running timer/);
    await page.locator('#result button').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#outage-facts').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.name), 'durationKnown');
    passed.push(`${label}: actual hidden/visible return removes conditional snapshot, preserves entries/storage/form focus, and keyboard action reaches outage facts`);

    await page.locator('#outageMinutes').fill('241'); await submit(page);
    assert.equal(await title(page), 'Discard this food');
    await awayAndBack(page, other);
    assert.match(await page.locator('#result .next-action').textContent(), /previous review advised: Discard this food/);
    assert.match(await page.locator('#result .result-footnote').textContent(), /Never taste food to test it/);
    assert.equal(await page.locator('#result-title').evaluate(e => e === document.activeElement), true);
    await awayAndBack(page, other);
    assert.equal(await page.locator('#result button').count(), 1);
    assert.equal(await page.locator('#outageMinutes').inputValue(), '241');
    await page.locator('#result').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${label}-paused-discard.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    passed.push(`${label}: prior disposal warning and original caution remain visible; repeated returns are idempotent with no horizontal overflow`);

    await page.locator('#outageMinutes').fill('180'); await submit(page);
    await page.goto('about:blank'); await page.goBack(); await nativeVisibility(page);
    await page.waitForFunction(() => document.querySelector('#result-title'));
    assert.notEqual(await title(page), 'Within the general closed-door window');
    assert.equal(await page.locator('#outageMinutes').inputValue(), '180');
    history.push({ viewport: label, persisted: await page.evaluate(() => window.lastPersistedShow), result: await title(page) });
    passed.push(`${label}: actual history Back never resurrects the conditional snapshot`);

    await page.reload(); await nativeVisibility(page);
    assert.equal(await title(page), 'A pause before a decision.');
    assert.match(await page.locator('#session-status').textContent(), /not a current reading/);
    assert.equal(await page.locator('#fact-check-note').isVisible(), true);
    await page.locator('#outageMinutes').fill('181');
    assert.equal(await page.locator('#fact-check-note').isVisible(), true);
    await submit(page); assert.equal(await page.locator('#fact-check-note').isVisible(), false);
    passed.push(`${label}: reload restores only choices and retains the fact-check reminder through edits until explicit review`);

    // The destination is a clearly synthetic fixture, not a copied official page.
    await context.route('https://www.foodsafety.gov/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Source navigation test fixture</title><p>Synthetic destination for source-link lifecycle test.</p>' }));
    const popupPromise = context.waitForEvent('page');
    await page.locator('.result-sources a').first().focus(); await page.keyboard.press('Enter');
    const popup = await popupPromise; await popup.waitForLoadState(); await nativeVisibility(popup);
    assert.match(popup.url(), /^https:\/\/www\.foodsafety\.gov\/food-safety-charts\//);
    await popup.bringToFront(); await visible(page, 'hidden');
    await popup.close(); await page.bringToFront(); await visible(page, 'visible');
    assert.equal(await title(page), 'Check your facts after returning');
    passed.push(`${label}: keyboard-opened source tab intentionally pauses the result on return (synthetic destination)`);

    await page.waitForFunction(() => document.querySelector('#offline-status').textContent.startsWith('Offline copy ready'));
    await context.setOffline(true); await page.reload(); await nativeVisibility(page);
    assert.equal(await title(page), 'A pause before a decision.');
    assert.equal(await page.locator('#outageMinutes').inputValue(), '181');
    assert.equal(await page.locator('#fact-check-note').isVisible(), true);
    await submit(page); await awayAndBack(page, other);
    assert.equal(await title(page), 'Check your facts after returning');
    passed.push(`${label}: offline reload uses the updated app and interrupted review still pauses`);
    for (let n = 0; n < 2; n++) { await page.locator('#clear-session').click(); await page.waitForFunction(() => document.querySelector('#session-status').textContent.startsWith('Session cleared')); }
    assert.equal(await saved(page), null); assert.equal(await page.locator('#food').inputValue(), '');
    assert.equal(await page.locator('#fact-check-note').isVisible(), false);
    await awayAndBack(page, other); assert.equal(await title(page), 'A pause before a decision.');
    assert.deepEqual(errors, []);
    passed.push(`${label}: repeated clear resets reminder and result without later resurrection; no page errors`);
    await context.close();
  }
  const report = { passed, history, limitations: ['Chromium under a virtual display only, not a physical device or screen-reader speech test.', 'A continuously visible page is not a timer; entered duration must still be updated manually.', 'The source-link destination is intercepted by a clearly labeled synthetic fixture.'] };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${output}/failure.txt`, String(error.stack)); throw error;
} finally { await browser.close(); await new Promise(r => server.close(r)); }
