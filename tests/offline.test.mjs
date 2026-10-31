import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function workerHarness({failInstall=false}={}) {
  const listeners={}, data=new Map(), deleted=[];
  const cache = { async addAll(files) { if(failInstall)throw Error('storage unavailable'); for(const file of files)data.set(new URL(file,'http://local/').href,{file}); }, async match(request) { const url = new URL(typeof request==='string'?request:request.url,'http://local/'); url.search=''; return data.get(url.href); } };
  let network=0, claimed=0, skipped=0;
  const context = { URL, Promise, caches:{open:async()=>cache,keys:async()=>['unrelated-cache','coldpause-old','coldpause-v1-20261031a'],delete:async key=>{deleted.push(key);return true;}},fetch:async()=>{network++;throw Error('offline');},self:{location:{origin:'http://local'},addEventListener:(event,fn)=>listeners[event]=fn,skipWaiting:async()=>{skipped++},clients:{claim:async()=>{claimed++}}} };
  vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),context);
  async function lifecycle(type) { let done; listeners[type]({waitUntil:promise=>done=promise}); await done; }
  return {listeners,data,deleted,lifecycle,get network(){return network},get claimed(){return claimed},get skipped(){return skipped}};
}

test('offline cache install contains every runtime asset and activation preserves unrelated caches', async () => {
  const h=await workerHarness(); await h.lifecycle('install'); await h.lifecycle('activate');
  for(const path of ['/','/index.html','/styles.css','/app.mjs','/rules.mjs','/icon.svg']) assert.ok(h.data.has(`http://local${path}`),path);
  assert.equal(h.data.size,6); assert.equal(h.skipped,1); assert.equal(h.claimed,1); assert.deepEqual(h.deleted,['coldpause-old']);
});

test('offline reload and assets resolve entirely from cache in service-worker simulation', async () => {
  const h=await workerHarness(); await h.lifecycle('install');
  for(const path of ['/','/index.html','/styles.css','/app.mjs','/rules.mjs','/icon.svg','/?offline=1']) {
    let answer; h.listeners.fetch({request:{url:`http://local${path}`,method:'GET'},respondWith:p=>answer=p}); assert.ok(await answer,path);
  }
  assert.equal(h.network,0);
});

test('readiness only becomes true after full installation; failed install is not ready', async () => {
  const h=await workerHarness(); let ready;
  async function status(){let done;h.listeners.message({data:'cache-status',ports:[{postMessage:obj=>ready=obj.ready}],waitUntil:p=>done=p});await done;return ready;}
  assert.equal(await status(),false); await h.lifecycle('install'); assert.equal(await status(),true);
  const bad=await workerHarness({failInstall:true}); await assert.rejects(bad.lifecycle('install'),/storage unavailable/); assert.equal(bad.skipped,0);
});

test('worker leaves other origins and non-GET requests alone', async () => {
  const h=await workerHarness();
  for(const request of [{url:'https://www.cdc.gov/',method:'GET'},{url:'http://local/',method:'POST'}]) h.listeners.fetch({request,respondWith:()=>assert.fail('must not intercept')});
});
