// Actual Chromium integration tests; offline mode is browser emulation, not physical disconnection.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
let failIcon = true, silentWorker = false, failedIconRequests = 0;
const root = process.cwd(), results = [];
const server = createServer(async (req,res) => {
  const path = new URL(req.url,'http://local').pathname;
  if(path === '/icon.svg' && failIcon) {failedIconRequests++;res.writeHead(503);res.end('simulated unavailable cache asset');return;}
  try {
    let content = await readFile(resolve(root, '.' + (path === '/' ? '/index.html' : path)));
    if(path === '/sw.js' && silentWorker) content = Buffer.from(content.toString().replace("if (event.data !== 'cache-status') return;", 'return;'));
    const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':types[extname(path)] || 'text/html','Cache-Control':'no-store'});res.end(content);
  } catch {res.writeHead(404);res.end('not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
await mkdir('evidence/offline-lifecycle',{recursive:true});
const browser=await chromium.launch();
async function status(page,text) {await page.locator('#offline-status').filter({hasText:text}).waitFor({timeout:18000});assert.equal(await page.locator('#offline-status').textContent(),text);}
async function capture(page,name){await page.screenshot({path:`evidence/offline-lifecycle/${name}.png`,fullPage:true});}
try {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(url);await status(page,'Offline copy not ready');assert.ok(failedIconRequests>0);await capture(page,'failed-first-install-mobile');results.push('Failed first install becomes explicitly not ready');
  failIcon=false;await page.reload();await status(page,'Offline copy ready');results.push('Reload online recovers installation');
  await page.locator('#food').selectOption('milk');
  await page.locator('[name="durationKnown"][value="known"]').check();
  await page.locator('#outageMinutes').fill('180');
  for(const [id,value] of Object.entries({doors:'closed',initialCold:'yes',coldSource:'no',spoilage:'no'})) await page.locator('#'+id).selectOption(value);
  await page.locator('button[type="submit"]').click();await page.locator('#result-title').filter({hasText:'Within the general'}).waitFor();
  await page.locator('#outageMinutes').fill('181');assert.match(await page.locator('#result').textContent(),/Facts changed/);results.push('Form guidance invalidation preserved');
  await context.setOffline(true);await page.reload();await status(page,'Offline copy ready · offline detected');assert.equal(await page.locator('#outageMinutes').inputValue(),'181');results.push('Emulated offline reload restores choices, not result');
  assert.doesNotMatch(await page.locator('#result').textContent(),/Within the general/);
  await page.locator('#clear-session').click();assert.equal(await page.locator('#food').inputValue(),'');assert.equal(await page.locator('#food').evaluate(e=>e===document.activeElement),true);
  await page.locator('#clear-session').click();assert.equal(await page.locator('#food').inputValue(),'');await capture(page,'offline-cleared-mobile');results.push('Clear remains keyboard-focused and repeatable offline');await context.close();
  silentWorker=true;
  const silent=await browser.newContext({viewport:{width:1280,height:900}});const other=await silent.newPage();await other.goto(url);assert.equal(await other.evaluate(()=>Promise.race([navigator.serviceWorker.ready.then(r=>r.active?.state),new Promise(resolve=>setTimeout(()=>resolve('timeout'),8000))])),'activated');await status(other,'Offline copy not ready');await capture(other,'missing-cache-reply-desktop');results.push('Missing cache response times out conservatively');await silent.close();
  await writeFile('evidence/offline-lifecycle/report.json',JSON.stringify({passed:results,limitations:['Chrome emulated offline, not physical disconnection','No screen-reader speech or physical-device check']},null,2));
  console.log(JSON.stringify({passed:results}));
} finally {await browser.close();await new Promise(r=>server.close(r));}
