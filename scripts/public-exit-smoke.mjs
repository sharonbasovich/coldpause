// Hosted QA only: real public bytes, no server, routing, injected app code or storage.
import {chromium, request} from 'playwright';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const expected = JSON.parse(await readFile(new URL('./public-smoke-expected.json', import.meta.url)));
const base = expected.baseURL, dir = 'evidence/public-exit-smoke';
const report = {expected, started: new Date().toISOString(), http: [], loaded: [], dialogs: [], passed: [], pageErrors: [], limitations: ['Chromium desktop only, fresh synthetic browser context; no physical-device or existing-user-cache claim.', 'Missing native prompt is an observed hosted-run failure, not alone proof of a product defect.']};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function verify(file, bytes) {
  assert.equal(bytes.length, expected.files[file].size, `${file}: byte length`);
  assert.equal(digest(bytes), expected.files[file].sha256, `${file}: SHA256`);
}
await mkdir(dir, {recursive: true});
let browser, context, api, a, b, stage = 'HTTP identity';
const status = (page, text) => page.waitForFunction(text => document.querySelector('#session-status')?.textContent.includes(text), text);
const saved = page => page.evaluate(() => localStorage.getItem('coldpause-session-v1'));
const shot = name => b.screenshot({path: `${dir}/${name}.png`, fullPage: true});
async function home(action) {
  // A real trusted click before navigation; no synthetic beforeunload dispatch.
  await b.locator('label[for="food"]').click();
  assert.equal(await b.evaluate(() => navigator.userActivation.hasBeenActive), true);
  const event = {action, observed: false}; report.dialogs.push(event);
  let handlerError, handled = Promise.resolve();
  const handler = dialog => {
    handled = (async () => {
    event.observed = true; event.type = dialog.type();
    try {
      assert.equal(dialog.type(), 'beforeunload');
      await dialog[action]();
    } catch (error) { handlerError = error; await dialog.dismiss().catch(() => {}); }
    })();
  };
  b.once('dialog', handler);
  try {
    const navigation = action === 'accept' ? b.waitForEvent('domcontentloaded').then(() => null, error => error) : null;
    await b.getByRole('link', {name: 'ColdPause home', exact: true}).click({noWaitAfter: true});
    // Poll a test observation, not app state injection. No fixed sleep determines success.
    const deadline = Date.now() + 10000;
    while (!event.observed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(event.observed, true, 'Actual home link did not expose a native beforeunload prompt');
    await handled;
    if (handlerError) throw handlerError;
    if (navigation) { const error = await navigation; if (error) throw error; }
  } finally { b.off('dialog', handler); }
}
try {
  api = await request.newContext();
  for (const file of Object.keys(expected.files)) {
    const url = new URL(file, base).href;
    const response = await api.get(url, {headers: {'Cache-Control': 'no-cache'}});
    const bytes = await response.body();
    report.http.push({file, status: response.status(), finalURL: response.url(), mime: response.headers()['content-type'], size: bytes.length, sha256: digest(bytes)});
    assert.equal(response.status(), 200); assert.equal(response.url(), url); verify(file, bytes);
  }
  report.passed.push('All six public HTTP runtime responses match pinned deployed main bytes.');
  stage = 'Loaded runtime identity';
  browser = await chromium.launch();
  context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  context.setDefaultTimeout(15000);
  context.on('page', page => page.on('pageerror', error => report.pageErrors.push(String(error.stack || error))));
  a = await context.newPage();
  const loads = [];
  a.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== new URL(base).origin) return;
    let file = url.pathname.slice(new URL(base).pathname.length) || 'index.html';
    if (!expected.files[file]) return;
    loads.push((async () => {
      const bytes = await response.body();
      report.loaded.push({file, url: response.url(), status: response.status(), fromServiceWorker: response.fromServiceWorker(), sha256: digest(bytes)});
      assert.equal(response.status(), 200); verify(file, bytes);
    })().then(() => null, error => String(error.stack)));
  });
  await a.goto(base, {waitUntil: 'networkidle'});
  await a.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  report.serviceWorker = await a.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {scope: registration?.scope, scriptURL: registration?.active?.scriptURL, controller: navigator.serviceWorker.controller?.scriptURL};
  });
  assert.equal(report.serviceWorker.scope, base);
  assert.equal(report.serviceWorker.scriptURL, new URL('sw.js', base).href);
  assert.equal(report.serviceWorker.controller, report.serviceWorker.scriptURL);
  assert.deepEqual((await Promise.all(loads)).filter(Boolean), []);
  for (const file of ['index.html', 'app.mjs', 'rules.mjs', 'styles.css', 'icon.svg']) assert.ok(report.loaded.some(item => item.file === file), `Loaded ${file} observed`);
  report.passed.push('Loaded document/modules/styles/icon match pinned runtime; actual service-worker scope and controller verified.');
  stage = 'Cross-tab conflict';
  b = await context.newPage(); await b.goto(base);
  // Both tabs start blank. Peer saves milk; stale tab retains rice without writing it.
  await a.locator('#food').selectOption('milk'); await status(a, 'Choices saved');
  await status(b, 'Saved choices changed');
  await b.locator('#food').selectOption('rice'); await status(b, 'Saved choices changed');
  const peerBytes = await saved(a); assert.equal(JSON.parse(peerBytes).food, 'milk');
  assert.equal(await b.locator('#food').inputValue(), 'rice');
  await shot('before-cancel');
  stage = 'Native home Cancel'; await home('dismiss');
  assert.equal(await b.locator('#food').inputValue(), 'rice');
  await status(b, 'Saved choices changed'); assert.equal(await saved(a), peerBytes);
  await shot('after-cancel'); report.passed.push('Actual home-link native Cancel retains conflicting rice and saved peer milk.');
  stage = 'Native home accept'; await home('accept');
  await status(b, 'Saved choices restored'); assert.equal(await b.locator('#food').inputValue(), 'milk');
  assert.equal(await saved(a), peerBytes); await shot('after-accepted-home');
  report.passed.push('Repeated home click exposes a second native prompt; acceptance restores peer milk.');
  stage = 'Explicit discard';
  await a.locator('[name="durationKnown"][value="known"]').check(); await status(a, 'Choices saved');
  await status(b, 'Saved choices changed'); await b.locator('#food').selectOption('rice');
  let unexpectedDialog = false;
  const dismissUnexpected = async dialog => { unexpectedDialog = true; await dialog.dismiss(); };
  b.on('dialog', dismissUnexpected);
  try {
    await Promise.all([b.waitForEvent('domcontentloaded'), b.locator('#reload-choices').click({noWaitAfter: true})]);
    await status(b, 'Saved choices restored');
    assert.equal(unexpectedDialog, false, 'Explicit discard should not request another prompt');
    assert.equal(await b.locator('#food').inputValue(), 'milk');
    assert.equal(JSON.parse(await saved(b)).food, 'milk'); await shot('after-explicit-discard');
  } finally { b.off('dialog', dismissUnexpected); }
  report.passed.push('Explicit discard restores peer milk without native warning.');
  stage = 'UI cleanup'; await b.locator('#clear-session').click(); await status(b, 'Session cleared');
  assert.equal(await saved(b), null);
  assert.deepEqual(report.pageErrors, [], 'No uncaught page errors');
  report.success = true;
} catch (error) {
  report.success = false; report.failedStage = stage; report.error = String(error.stack || error);
  await (b || a)?.screenshot({path: `${dir}/failure.png`, fullPage: true}).catch(() => {});
  process.exitCode = 1;
} finally {
  // Even on failure, all state is confined to this disposable synthetic context.
  await context?.close(); await browser?.close(); await api?.dispose();
  report.finished = new Date().toISOString();
  await writeFile(`${dir}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
