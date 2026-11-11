import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),key='coldpause-session-v1',results=[];
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://local').pathname;try {const content=await readFile(resolve(root,'.'+(path==='/'?'/index.html':path)));res.writeHead(200,{'Content-Type':({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'text/html','Cache-Control':'no-store'});res.end(content);}catch{res.writeHead(404);res.end('missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
await mkdir('evidence/storage',{recursive:true});const browser=await chromium.launch();
const saved=page=>page.evaluate(key=>localStorage.getItem(key),key);
async function status(page,text){await page.waitForFunction(text=>document.querySelector('#session-status').textContent.includes(text),text,{timeout:8000});}
async function seed(page){await page.locator('#food').selectOption('milk');await page.locator('[name="durationKnown"][value="known"]').check();await page.locator('#outageMinutes').fill('90');await status(page,'Choices saved');}
async function dismissExitWarning(page) {
 const before=page.url();let observed=false;
 const handler=async dialog=>{assert.equal(dialog.type(),'beforeunload');observed=true;await dialog.dismiss();};
 page.once('dialog',handler);
 try { await page.reload({timeout:750}); }
 catch(error) { if(!observed || !(error.name==='TimeoutError' || /net::ERR_ABORTED/.test(error.message))) throw error; }
 finally { page.off('dialog',handler); }
 assert.equal(observed,true,'an actual beforeunload dialog must be observed');assert.equal(page.url(),before);
}
async function acceptReload(page) {
 const handler=async dialog=>{assert.equal(dialog.type(),'beforeunload');await dialog.accept();};
 page.once('dialog',handler);
 try { await page.reload(); } finally { page.off('dialog',handler); }
}
let currentPage;
try {
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const a=await context.newPage(),b=await context.newPage();currentPage=b;
 await a.goto(url);await seed(a);await b.goto(url);assert.equal(await b.locator('#food').inputValue(),'milk');
 await a.locator('#clear-session').click();await status(a,'Session cleared');assert.equal(await saved(a),null);
 await b.locator('#outageMinutes').fill('91');await b.waitForTimeout(150);
 assert.equal(await saved(a),null,'stale tab must not resurrect cleared food and evidence');
 await status(b,'Saved choices changed');assert.equal(await b.locator('#food').inputValue(),'milk');assert.equal(await b.locator('#outageMinutes').inputValue(),'91');
 await b.screenshot({path:'evidence/storage/conflict-mobile.png',fullPage:true});results.push('Clear in one tab cannot be resurrected by stale tab; its draft is retained');
 await b.locator('#reload-choices').click();await b.waitForLoadState();assert.equal(await b.locator('#food').inputValue(),'');assert.equal(await b.locator('#outageMinutes').inputValue(),'');assert.equal(await saved(b),null);results.push('Explicit reload discards stale draft and restores cleared state');
 await seed(a);await acceptReload(b);await a.locator('#outageMinutes').fill('100');await status(a,'Choices saved');await b.locator('#outageMinutes').fill('101');await status(b,'Saved choices changed');assert.equal(JSON.parse(await saved(a)).outageMinutes,'100');results.push('Newer saved choices are not overwritten by stale peer');
 await b.locator('#clear-session').click();assert.equal(await b.locator('#food').inputValue(),'');assert.equal(JSON.parse(await saved(a)).outageMinutes,'100');await status(b,'Form cleared in this tab only');assert.equal(await b.locator('#announcement').textContent(),'Form cleared in this tab.');results.push('Conflicted Clear clears only this tab, preserving newer saved choices');
 // Hold the same named Web Lock without changing app or storage APIs.
 await a.evaluate(key=>{window.lockHeld=new Promise(resolve=>{navigator.locks.request(`${key}.write`,()=>new Promise(release=>{window.releaseHeld=release;resolve();}));});},key);await a.evaluate(()=>window.lockHeld);
 await a.locator('#outageMinutes').fill('102');await status(a,'Saving choices');
 await dismissExitWarning(a);assert.equal(await a.locator('#outageMinutes').inputValue(),'102');results.push('Pending-save navigation warns and dismissal retains the draft');await a.locator('#clear-session').click();await status(a,'Clearing saved');await a.evaluate(()=>window.releaseHeld());await status(a,'Session cleared');assert.equal(await saved(a),null);results.push('Clear supersedes a queued save without restoring old draft');
 await seed(a);await a.evaluate(key=>{window.lockHeld=new Promise(resolve=>{navigator.locks.request(`${key}.write`,()=>new Promise(release=>{window.releaseHeld=release;resolve();}));});},key);await a.evaluate(()=>window.lockHeld);
 await a.locator('#outageMinutes').fill('103');await status(a,'Saving choices');await status(a,'Local saving is unavailable');assert.equal(JSON.parse(await saved(a)).outageMinutes,'90');await a.evaluate(()=>window.releaseHeld());await a.waitForTimeout(200);assert.equal(JSON.parse(await saved(a)).outageMinutes,'90');await dismissExitWarning(a);assert.equal(await a.locator('#outageMinutes').inputValue(),'103');
 results.push('Held lock timeout keeps the settled unsaved draft protected after Cancel');
 // Explicit event suppression isolates the compare-under-lock guard. This is a
 // synthetic delivery delay in real Chromium, not a real tab-freeze claim.
 const delayed=await browser.newContext({viewport:{width:390,height:844}});
 await delayed.addInitScript(()=>window.addEventListener('storage',event=>event.stopImmediatePropagation(),true));
 const first=await delayed.newPage(),stale=await delayed.newPage();currentPage=stale;
 await first.goto(url);await stale.goto(url);await seed(first);await first.locator('#clear-session').click();await status(first,'Session cleared');
 await stale.locator('#food').selectOption('chicken');await status(stale,'Saved choices changed');assert.equal(await saved(first),null);
 assert.equal(await stale.locator('#food').inputValue(),'chicken');
 assert.deepEqual(await first.evaluate(()=>Object.keys(localStorage)),[`${key}.generation`]);
 await stale.screenshot({path:'evidence/storage/delayed-reset-mobile.png',fullPage:true});
 results.push('Suppressed storage-event delivery: save then clear cannot be undone by an initially empty peer');
 await stale.locator('#reload-choices').click();await stale.waitForLoadState();await seed(first);await acceptReload(stale);const original=await saved(first);
 await first.locator('#outageMinutes').fill('100');await status(first,'Choices saved');await first.locator('#outageMinutes').fill('90');await status(first,'Choices saved');assert.equal(await saved(first),original);
 await stale.locator('#outageMinutes').fill('91');await status(stale,'Saved choices changed');assert.equal(await saved(first),original);
 await dismissExitWarning(stale);assert.equal(await stale.locator('#outageMinutes').inputValue(),'91');
 results.push('Suppressed storage-event delivery: A to B to A still conflicts and protects the changed draft');
 await delayed.close();
 await context.close();
 const noLocks=await browser.newContext({viewport:{width:1280,height:900}});await noLocks.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));const p=await noLocks.newPage();currentPage=p;await p.goto(url);await p.locator('#food').selectOption('milk');await status(p,'Local saving is unavailable');assert.equal(await saved(p),null);
 await dismissExitWarning(p);assert.equal(await p.locator('#food').inputValue(),'milk');
 await acceptReload(p);assert.equal(await p.locator('#food').inputValue(),'');
 results.push('No-lock session-only choices survive native Cancel; accepted reload discards them');
 await p.locator('#food').selectOption('milk');await status(p,'Local saving is unavailable');await p.locator('#clear-session').click();await status(p,'Form cleared in this tab only');await p.screenshot({path:'evidence/storage/no-locks-desktop.png',fullPage:true});results.push('Unavailable locks keep session-only choices and honest clear status');await noLocks.close();
 const normal=await browser.newContext({viewport:{width:1280,height:900}});const q=await normal.newPage();currentPage=q;await q.goto(url);await seed(q);await q.locator('button[type="submit"]').click();await q.locator('#result-title').filter({hasText:'There is not enough evidence'}).waitFor();await q.screenshot({path:'evidence/storage/normal-desktop.png',fullPage:true});await q.locator('#clear-session').click();await status(q,'Session cleared');assert.equal(await q.locator('#food').evaluate(e=>e===document.activeElement),true);results.push('Food guidance and clear focus remain intact');await seed(q);const beforeFailure=await saved(q);await q.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError');};Storage.prototype.removeItem=function(){throw new DOMException('Test permission','SecurityError');};});await q.locator('#outageMinutes').fill('110');await status(q,'Local saving is unavailable');assert.equal(await saved(q),beforeFailure);
 await dismissExitWarning(q);assert.equal(await q.locator('#outageMinutes').inputValue(),'110');await q.locator('#clear-session').click();await status(q,'Saved choices could not be removed');assert.equal(await saved(q),beforeFailure);assert.equal(await q.locator('#announcement').textContent(),'Form cleared in this tab.');await dismissExitWarning(q);assert.equal(await q.locator('#food').inputValue(),'');
 results.push('Failed saving and failed Clear remain protected after writes settle');await normal.close();
 // A peer save is unseen, and all recovery reads in the blank tab then fail.
 // This is a synthetic storage failure/delayed event, with an actual native dialog.
 const unseen=await browser.newContext({viewport:{width:390,height:844}});
 const blank=await unseen.newPage();currentPage=blank;
 await blank.addInitScript(()=>window.addEventListener('storage',event=>event.stopImmediatePropagation(),true));
 await blank.goto(url);const peer=await unseen.newPage();await peer.goto(url);await seed(peer);
 const peerBytes=await saved(peer);
 assert.equal(await blank.locator('#food').inputValue(),'');
 await blank.evaluate(()=>{Storage.prototype.getItem=function(){throw new DOMException('Test read failure','SecurityError');};});
 await blank.locator('#clear-session').click();await status(blank,'Saved choices could not be removed');
 await dismissExitWarning(blank);assert.equal(await blank.locator('#food').inputValue(),'');assert.equal(await saved(peer),peerBytes);
 await acceptReload(blank);assert.equal(await blank.locator('#food').inputValue(),'milk');
 results.push('Unobserved peer save plus unreadable failed Clear requests native warning; accepted reload restores peer choices');await unseen.close();
 const malformed=await browser.newContext({viewport:{width:1280,height:900}});
 const numeric=await malformed.newPage();currentPage=numeric;await numeric.goto(url);
 for(const field of ['outageMinutes','warmMinutes']) for(const value of ['not-a-number',' 90 ','Infinity','1e309']) {
   await numeric.evaluate(({key,field,value})=>{localStorage.setItem(key,JSON.stringify({food:'milk',durationKnown:'known',evidence:'warm',[field]:value}));}, {key,field,value});
   await acceptReload(numeric);assert.equal(await numeric.locator(`#${field}`).inputValue(),'');
   assert.equal(await numeric.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),false);
 }
 results.push('Native number controls sanitize malformed stored minutes without a handler exit warning');await malformed.close();
 await writeFile('evidence/storage/report.json',JSON.stringify({passed:results,limitations:['Chromium only; no physical device or screen-reader speech verification','Old already-open code versions do not participate in new lock protocol']},null,2));console.log(JSON.stringify({passed:results}));
} catch(error) {await currentPage?.screenshot({path:'evidence/storage/failure.png',fullPage:true}).catch(()=>{});await writeFile('evidence/storage/failure.txt',String(error.stack));throw error;} finally {await browser.close();await new Promise(r=>server.close(r));}
