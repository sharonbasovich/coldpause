// Pure VM tests: the HTTP module, listen/address calls and file reader are fakes.
// This file never imports the executable helper or opens a server/socket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import vm from 'node:vm';

const sourceURL = new URL('../server.mjs', import.meta.url);
const sourceRoot = fileURLToPath(new URL('.', sourceURL));
const source = (await readFile(sourceURL, 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(sourceURL.href));

function harness({ configuredPort, assignedPort, listenError, readError } = {}) {
  const logs = [], readPaths = [];
  let handler, requestPort, requestHost, ready;
  const fakeServer = {
    listen(port, host, callback) {
      requestPort = port; requestHost = host;
      if (listenError) throw listenError;
      ready = callback;
    },
    address() { return { address: '127.0.0.1', family: 'IPv4', port: assignedPort ?? requestPort }; }
  };
  const context = {
    http: { createServer(callback) { handler = callback; return fakeServer; } },
    readFile: async path => { readPaths.push(path); if (readError) throw readError; return Buffer.from('synthetic asset'); },
    fileURLToPath, resolve, extname, sep, URL,
    process: { env: configuredPort === undefined ? {} : { COLDPAUSE_PORT: configuredPort }, stdout: { write: text => logs.push(text) } }
  };
  const run = () => vm.runInNewContext(source, context);
  if (listenError) { assert.throws(run, error => error === listenError); }
  else run();
  return {
    logs, readPaths,
    get requestPort() { return requestPort; }, get requestHost() { return requestHost; },
    confirmReady() { assert.ok(ready, 'fake listen callback exists'); ready(); },
    async request(url, method = 'GET') {
      let status, headers, body;
      await handler({ url, method }, { writeHead(code, values) { status = code; headers = values; }, end(value) { body = value; } });
      return { status, headers, body };
    }
  };
}

test('package start invokes this helper and its default host/port are consistent', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.start, 'node server.mjs');
  const h = harness();
  assert.equal(h.requestHost, '127.0.0.1'); assert.equal(h.requestPort, 4173);
  assert.deepEqual(h.logs, []);
  h.confirmReady(); assert.deepEqual(h.logs, ['ColdPause local preview: http://127.0.0.1:4173\n']);
});

test('readiness reports the assigned ephemeral port rather than requested zero', () => {
  const h = harness({ configuredPort: '0', assignedPort: 54321 });
  assert.equal(h.requestPort, 0); assert.equal(h.logs.length, 0);
  h.confirmReady(); assert.deepEqual(h.logs, ['ColdPause local preview: http://127.0.0.1:54321\n']);
});

test('a configured fixed port is reported only after fake listen success', () => {
  const h = harness({ configuredPort: '8123', assignedPort: 8123 });
  assert.equal(h.requestPort, 8123); assert.equal(h.requestHost, '127.0.0.1'); assert.equal(h.logs.length, 0);
  h.confirmReady(); assert.equal(h.logs[0], 'ColdPause local preview: http://127.0.0.1:8123\n');
});

test('listen failure cannot produce a readiness message', () => {
  const h = harness({ listenError: new Error('synthetic bind failure') });
  assert.equal(h.logs.length, 0);
});

test('root and asset paths resolve from the helper location without relying on cwd', async () => {
  const h = harness();
  const home = await h.request('/?synthetic=1'); const asset = await h.request('/styles.css?synthetic=1');
  assert.equal(home.status, 200); assert.equal(asset.status, 200);
  assert.deepEqual(h.readPaths, [resolve(sourceRoot, 'index.html'), resolve(sourceRoot, 'styles.css')]);
  assert.equal(home.headers['Content-Type'], 'text/html; charset=utf-8'); assert.equal(asset.headers['Content-Type'], 'text/css; charset=utf-8');
  // The fake process intentionally has no cwd function. Directory resolution
  // must derive from the source URL, as it does in the executable helper.
});

test('HEAD suppresses the body and a file-reader failure receives a plain 404', async () => {
  const head = await harness().request('/rules.mjs', 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body, undefined);
  const missing = await harness({ readError: new Error('synthetic missing file') }).request('/missing.css');
  assert.equal(missing.status, 404); assert.equal(missing.body, 'Not found'); assert.equal(missing.headers['Content-Type'], 'text/plain');
});
