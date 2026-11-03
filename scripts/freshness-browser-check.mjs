// Chromium UI checks. History/reload/keyboard are real browser interactions.
// Paused-state rendering additionally uses a labeled synthetic pageshow event:
// Playwright focus emulation prevents reliable native hidden-tab automation.
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
const browser = await chromium.launch({ ignoreDefaultArgs: ['--disable-back-forward-cache'] });
let page;
const saved = p => p.evaluate(k => localStorage.getItem(k), key);
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
async function simulatedResume(p) {
  await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
}
try {
  for (const [label, width, height] of [['desktop', 1280, 900], ['narrow', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(String(e))));
    await context.addInitScript(() => window.addEventListener('pageshow', e => { window.lastPersistedShow = e.persisted; }));
    page = await context.newPage(); await page.goto(url); await seed(page); await submit(page);
    assert.equal(await title(page), 'Within the general closed-door window');
    await page.locator('#outageMinutes').focus();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await title(page), 'Within the general closed-door window');
    const before = await saved(page);
    await simulatedResume(page);
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
    passed.push(`${label}: simulated resume removes conditional snapshot without changing entries/storage/input focus; real Enter and Tab reach outage facts`);

    await page.locator('#outageMinutes').fill('241'); await submit(page);
    assert.equal(await title(page), 'Discard this food');
    await simulatedResume(page);
    assert.match(await page.locator('#result .next-action').textContent(), /previous review advised: Discard this food/);
    assert.match(await page.locator('#result .result-footnote').textContent(), /Never taste food to test it/);
    assert.equal(await page.locator('#result-title').evaluate(e => e === document.activeElement), true);
    await simulatedResume(page);
    assert.equal(await page.locator('#result button').count(), 1);
    assert.equal(await page.locator('#outageMinutes').inputValue(), '241');
    await page.locator('#result').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${label}-paused-discard.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    passed.push(`${label}: simulated resume retains prior disposal caution; repeated events are idempotent; rendered screenshot has no horizontal overflow`);

    await page.locator('#outageMinutes').fill('180'); await submit(page);
    await page.goto('about:blank'); await page.goBack();
    await page.waitForFunction(() => document.querySelector('#result-title'));
    const restoredTitle = await title(page);
    assert.notEqual(restoredTitle, 'Within the general closed-door window');
    assert.ok(['Check your facts after returning', 'A pause before a decision.'].includes(restoredTitle));
    assert.equal(await page.locator('#outageMinutes').inputValue(), '180');
    assert.equal(await page.locator('#fact-check-note').isVisible(), true);
    history.push({ viewport: label, persisted: await page.evaluate(() => window.lastPersistedShow), result: restoredTitle });
    await page.locator('#result').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${label}-actual-history-return.png`, fullPage: true });
    passed.push(`${label}: actual navigation and history Back do not resurrect conditional guidance (persisted/fresh restore recorded separately)`);

    await page.reload();
    assert.equal(await title(page), 'A pause before a decision.');
    assert.match(await page.locator('#session-status').textContent(), /not a current reading/);
    assert.equal(await page.locator('#fact-check-note').isVisible(), true);
    await page.locator('#outageMinutes').fill('181');
    assert.equal(await page.locator('#fact-check-note').isVisible(), true);
    await submit(page); assert.equal(await page.locator('#fact-check-note').isVisible(), false);
    passed.push(`${label}: actual reload restores choices only; reminder remains through edits until explicit keyboard review`);

    await page.waitForFunction(() => document.querySelector('#offline-status').textContent.startsWith('Offline copy ready'));
    await context.setOffline(true); await page.reload();
    assert.equal(await title(page), 'A pause before a decision.');
    assert.equal(await page.locator('#outageMinutes').inputValue(), '181');
    assert.equal(await page.locator('#fact-check-note').isVisible(), true);
    await submit(page); await simulatedResume(page);
    assert.equal(await title(page), 'Check your facts after returning');
    passed.push(`${label}: Chrome-emulated offline reload uses updated app; simulated resume still pauses`);
    for (let n = 0; n < 2; n++) { await page.locator('#clear-session').click(); await page.waitForFunction(() => document.querySelector('#session-status').textContent.startsWith('Session cleared')); }
    assert.equal(await saved(page), null); assert.equal(await page.locator('#food').inputValue(), '');
    assert.equal(await page.locator('#fact-check-note').isVisible(), false);
    await simulatedResume(page); assert.equal(await title(page), 'A pause before a decision.');
    assert.deepEqual(errors, []);
    passed.push(`${label}: repeated clear resets reminder and result without resurrection on simulated resume; no page errors`);
    await context.close();
  }
  const report = { passed, history, limitations: ['Chromium and resized viewports only, not physical-device or screen-reader speech verification.', 'Playwright focus emulation prevents reliable native hidden-tab automation. Handler tests cover hidden/visible events; paused-state browser rendering uses a labeled synthetic pageshow event.', 'Actual history navigation may restore from bfcache or reload the document; the report distinguishes these paths.', 'A continuously visible page is not a timer; entered duration must still be updated manually.', 'Official-source destination navigation is not included in this suite.'] };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${output}/failure.txt`, String(error.stack));
  await writeFile(`${output}/partial-report.json`, JSON.stringify({ passed, history }, null, 2)); throw error;
} finally { await browser.close(); await new Promise(r => server.close(r)); }
