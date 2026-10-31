const CACHE = 'coldpause-v1-20261031a';
const FILES = ['./', './index.html', './styles.css', './app.mjs', './rules.mjs', './icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('coldpause-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request, { ignoreSearch: true })) || fetch(event.request)));
});
self.addEventListener('message', event => {
  if (event.data !== 'cache-status') return;
  event.waitUntil(caches.open(CACHE).then(async cache => { const items = await Promise.all(FILES.map(file => cache.match(file))); event.ports[0]?.postMessage({ ready: items.every(Boolean) }); }));
});
