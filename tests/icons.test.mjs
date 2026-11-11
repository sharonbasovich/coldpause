// Structural regressions, not a claim of browser or screen-reader verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('initial pause and three arrows use decorative geometry, never font glyphs', () => {
  assert.doesNotMatch(html, /[Ⅱ↗]/);
  const icons = [...html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)].map(match => match[0]);
  assert.equal(icons.length, 4);
  for (const icon of icons) {
    assert.match(icon, /aria-hidden="true"/);
    assert.match(icon, /focusable="false"/);
    assert.match(icon, /viewBox="[^"]+"/);
    assert.match(icon, /currentColor/);
    assert.match(icon, /<path d="[^"]+"/);
    assert.doesNotMatch(icon, /<(?:text|image|use|title)\b|\bon\w+=|href=/);
  }
  assert.match(html, /Review this food <span aria-hidden="true"><svg/);
  assert.equal((html.match(/\(opens new tab, online\)/g) || []).length, 2);
});

test('dynamic changed-facts pause has the same static SVG as the initial pause', () => {
  assert.doesNotMatch(app, /Ⅱ/);
  const initial = html.match(/class="result-symbol"[^>]*>(<svg.*?<\/svg>)/)[1];
  const dynamic = app.match(/symbol\.innerHTML = '([^']+)';/)?.[1];
  assert.equal(dynamic, initial);
});

test('new worker installs into a new cache and retires old HTML without touching unrelated caches', async () => {
  const old = 'coldpause-v1-20261104';
  const current = worker.match(/const CACHE = '([^']+)'/)[1];
  assert.notEqual(current, old);
  const stores = new Map([[old, new Map([['http://local/', 'old glyph HTML']])], ['unrelated-cache', new Map()]]);
  const listeners = {}; let claimed = false; let skipped = false;
  vm.runInNewContext(worker, { URL, Promise,
    caches: {
      async open(name) {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name);
        return {
          async addAll(files) { for (const file of files) store.set(new URL(file, 'http://local/').href, file.endsWith('html') || file === './' ? html : file); },
          async match(request) { return store.get(new URL(typeof request === 'string' ? request : request.url, 'http://local/').href); }
        };
      },
      async keys() { return [...stores.keys()]; },
      async delete(key) { return stores.delete(key); }
    }, fetch: async () => { throw Error('offline'); },
    self: { location: { origin: 'http://local' }, addEventListener: (name, fn) => listeners[name] = fn,
      skipWaiting: async () => { skipped = true; }, clients: { claim: async () => { claimed = true; } } }
  });
  for (const event of ['install', 'activate']) { let done; listeners[event]({ waitUntil: p => done = p }); await done; }
  assert.ok(skipped && claimed);
  assert.ok(stores.has(current) && stores.has('unrelated-cache'));
  assert.ok(!stores.has(old));
  for (const path of ['/', '/index.html']) {
    let response;
    listeners.fetch({ request: { url: `http://local${path}`, method: 'GET' }, respondWith: p => response = p });
    assert.equal(await response, html);
  }
  let ready; let done;
  listeners.message({ data: 'cache-status', ports: [{ postMessage: message => ready = message.ready }], waitUntil: p => done = p });
  await done; assert.equal(ready, true);
});
