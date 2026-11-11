// Real Chromium, two releases on one origin. No production mutation or network fixture fetch.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';

const root = process.cwd();
const baseline = resolve(process.env.UPGRADE_BASELINE || '.upgrade-baseline');
const manifest = JSON.parse(await readFile(new URL('./upgrade-baseline.json', import.meta.url)));
const blob = bytes => createHash('sha1').update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
const oldFiles = {}, newFiles = {};
for (const [path, expected] of Object.entries(manifest.blobs)) {
  oldFiles['/' + path] = await readFile(resolve(baseline, path), 'utf8');
  assert.equal(blob(oldFiles['/' + path]), expected, `Pinned baseline blob: ${path}`);
  newFiles['/' + path] = await readFile(resolve(root, path), 'utf8');
}
oldFiles['/'] = oldFiles['/index.html']; newFiles['/'] = newFiles['/index.html'];
const cacheName = files => files['/sw.js'].match(/const CACHE = '([^']+)'/)[1];
const oldCache = cacheName(oldFiles), newCache = cacheName(newFiles);
assert.notEqual(oldCache, newCache, 'Upgrade must use a fresh cache');
assert.notEqual(oldFiles['/app.mjs'], newFiles['/app.mjs'], 'Negative control needs distinct old app');
const provenance = {baseline: manifest, candidateBlobs: Object.fromEntries(Object.entries(newFiles).map(([p,b]) => [p,blob(b)])), oldCache, newCache};
if (process.argv.includes('--verify-only')) {
  console.log(JSON.stringify({verified: provenance, browserRun: false}, null, 2));
} else {
  const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const output = resolve('evidence/upgrade');
  await mkdir(output, {recursive:true});
  const results = [];
  let release = oldFiles, browser, currentPage;
  const requests = [];
  const prefix = '/coldpause/';
  const server = createServer((req,res) => {
    const path = new URL(req.url, 'http://local').pathname;
    requests.push({path, release: release === oldFiles ? 'baseline' : 'candidate'});
    const relative = path.startsWith(prefix) ? '/' + path.slice(prefix.length) : null;
    const body = relative === null ? undefined : release[relative];
    res.writeHead(body === undefined ? 404 : 200, {'Content-Type': ({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)] || 'text/html', 'Cache-Control':'no-store'});
    res.end(body === undefined ? 'missing' : body);
  });
  const key = 'coldpause-session-v1';
  const saved = page => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  const status = (page,selector,text) => page.waitForFunction(({selector,text}) => document.querySelector(selector)?.textContent.includes(text), {selector,text}, {timeout:18000});
  async function cacheBytes(page, name, files, url) {
    const actual = await page.evaluate(async name => {
      const cache = await caches.open(name), entries = [];
      for (const request of await cache.keys()) entries.push([new URL(request.url).pathname, await (await cache.match(request)).text()]);
      return Object.fromEntries(entries);
    }, name);
    const expected = Object.fromEntries(Object.entries(files).filter(([p]) => p !== '/sw.js').map(([p,b]) => [new URL('.' + p,url).pathname,b]));
    assert.deepEqual(actual, expected, `Exact runtime bytes in ${name} at ${url}`);
  }
  async function scenario(url, negative) {
    release = oldFiles;
    const context = await browser.newContext({viewport:{width:390,height:844}, reducedMotion:'reduce'});
    const page = await context.newPage(); currentPage = page;
    try {
      await page.goto(url);
      await status(page,'#offline-status','Offline copy ready');
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      const registrationIdentity = () => page.evaluate(async () => ({scope:(await navigator.serviceWorker.getRegistration()).scope, scriptURL:navigator.serviceWorker.controller.scriptURL}));
      const expectedIdentity = {scope:url, scriptURL:new URL('sw.js',url).href};
      assert.deepEqual(await registrationIdentity(),expectedIdentity,'Baseline uses the deployed project scope');
      await cacheBytes(page, oldCache, oldFiles, url);
      await page.locator('#food').selectOption('milk');
      await page.locator('[name="durationKnown"][value="known"]').check();
      await page.locator('#outageMinutes').fill('180');
      await status(page,'#session-status','Choices saved');
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.outageMinutes === '180', key);
      const snapshot = await saved(page);
      // An unrelated origin cache must survive product-cache retirement.
      await page.evaluate(async () => { await (await caches.open('upgrade-unrelated')).put('/sentinel',new Response('keep')); });
      // Save the actual controller object, not just its identical /sw.js URL.
      await page.evaluate(() => { window.oldController = navigator.serviceWorker.controller; window.upgradeChanges = 0; navigator.serviceWorker.addEventListener('controllerchange', () => window.upgradeChanges++); });
      release = negative ? {...newFiles, '/app.mjs':oldFiles['/app.mjs']} : newFiles;
      await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
      await page.waitForFunction(() => window.upgradeChanges > 0 && navigator.serviceWorker.controller !== window.oldController && navigator.serviceWorker.controller.state === 'activated');
      assert.deepEqual(await registrationIdentity(),expectedIdentity,'Upgraded worker retains the project scope and script URL');
      const names = await page.evaluate(() => caches.keys());
      assert.deepEqual(names.sort(), [newCache,'upgrade-unrelated'].sort());
      assert.equal(await page.evaluate(async () => (await (await caches.open('upgrade-unrelated')).match('/sentinel')).text()), 'keep');
      await cacheBytes(page,newCache,release,url);
      assert.deepEqual(await saved(page),snapshot,'Worker replacement must not change stored choices or generation');
      await context.setOffline(true);
      const requestCount = requests.length;
      await page.reload();
      await status(page,'#offline-status','Offline copy ready · offline detected');
      assert.equal(await page.locator('#food').inputValue(),'milk');
      assert.equal(await page.locator('#outageMinutes').inputValue(),'180');
      assert.deepEqual(await saved(page),snapshot);
      for (const [path,expected] of Object.entries(release).filter(([p]) => p !== '/sw.js')) {
        const response = await page.evaluate(async path => {const r=await fetch(path);return {ok:r.ok,text:await r.text()};}, new URL('.' + path,url).href);
        assert.equal(response.ok,true); assert.equal(response.text,expected,`Offline response ${path}`);
      }
      assert.equal(requests.length,requestCount,'Offline navigation and asset reads must not reach server');
      const icons = page.locator('svg'); assert.equal(await icons.count(),4);
      for (const icon of await icons.all()) {assert.equal(await icon.getAttribute('aria-hidden'),'true');assert.equal(await icon.getAttribute('focusable'),'false');assert.ok(await icon.locator('path').count());}
      await page.locator('button[type="submit"]').click();
      // Fail a settled save, not a pending operation that old main also protects.
      await page.evaluate(() => {Storage.prototype.setItem = function(){throw new DOMException('Injected quota failure','QuotaExceededError');};});
      await page.locator('#outageMinutes').fill('181');
      await status(page,'#session-status','Local saving is unavailable');
      assert.match(await page.locator('#result').textContent(),/Facts changed/);
      assert.equal(await page.locator('.result-symbol svg').count(),1);
      assert.deepEqual(await saved(page),snapshot);
      // Trusted pointer gesture gives Chromium sticky activation for native beforeunload.
      await page.locator('#outageMinutes').click();
      let seen = false;
      const dismiss = async dialog => {assert.equal(dialog.type(),'beforeunload');seen=true;await dialog.dismiss();};
      page.once('dialog',dismiss);
      try {await page.reload({timeout:1500});}
      catch (error) {if (!seen || !(error.name === 'TimeoutError' || /net::ERR_ABORTED/.test(error.message))) throw error;}
      finally {page.off('dialog',dismiss);}
      if (!seen) {const error=new Error('Upgraded page failed to protect settled unsaved choices');error.code='EXIT_GUARD_MISSING';throw error;}
      assert.equal(await page.locator('#outageMinutes').inputValue(),'181');
      assert.deepEqual(await saved(page),snapshot);
      await page.screenshot({path:resolve(output,'upgrade-offline-cancel.png'),fullPage:true});
      let accepted=false;
      const accept=async dialog=>{assert.equal(dialog.type(),'beforeunload');accepted=true;await dialog.accept();};
      page.once('dialog',accept);
      try {await page.reload();} finally {page.off('dialog',accept);}
      assert.equal(accepted,true);
      await status(page,'#offline-status','Offline copy ready · offline detected');
      assert.equal(await page.locator('#outageMinutes').inputValue(),'180');
      assert.deepEqual(await saved(page),snapshot);
      assert.doesNotMatch(await page.locator('#result').textContent(),/Facts changed/);
      results.push('Real /coldpause/ main-to-candidate controller upgrade with exact registration scope/script URL, exact cache bytes, retired old cache, retained unrelated cache, saved choices and generation, offline runtime/SVGs, native Cancel and accepted reload');
    } catch (error) {
      if (error.code !== 'EXIT_GUARD_MISSING') await page.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});
      throw error;
    } finally {await context.close();currentPage=undefined;}
  }
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser = await chromium.launch();
    const url = `http://127.0.0.1:${server.address().port}${prefix}`;
    await scenario(url,false);
    await assert.rejects(scenario(url,true), error => error.code === 'EXIT_GUARD_MISSING', 'Old-main app negative control must fail specifically at settled unsaved navigation protection');
    results.push('Negative control detected: old-main app in candidate cache lacks settled unsaved native warning');
    await writeFile(resolve(output,'report.json'),JSON.stringify({provenance,passed:results,requests,limitations:['Chromium browser-emulated offline, not physical disconnection','Synthetic storage failure; no user data','No cross-browser, physical-device or screen-reader claim']},null,2));
    console.log(JSON.stringify({passed:results}));
  } catch(error) {
    await currentPage?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});
    await writeFile(resolve(output,'failure.json'),JSON.stringify({provenance,passed:results,requests,error:String(error.stack)},null,2));throw error;
  } finally {await browser?.close();if(server.listening) await new Promise(r=>server.close(r));}
}
