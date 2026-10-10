// Receipt Capture service worker: lets the app open without internet.
// App files: network first (so updates arrive), falling back to the saved copy when offline or slow.
// QR library: saved copy first. API calls (POST to Google) are never touched.
const CACHE = 'receipt-capture-v1';
const CORE = ['./', './index.html', './config.js'];
const LIB = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
const SLOW_MS = 4000;   // on a weak signal, show the saved app after this long

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE);
    // cache.add() refuses cross-site "opaque" responses, but put() stores them; the page loads it the same way
    try { await c.put(LIB, await fetch(new Request(LIB, { mode: 'no-cors' }))); } catch (err) { /* cached on first use instead */ }
  }));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (req.url === LIB) e.respondWith(cacheFirst(req));
});

function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const saved = () => caches.match(req, { ignoreSearch: true })
      .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    const timer = setTimeout(() => saved().then(finish), SLOW_MS);
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      clearTimeout(timer); finish(res);
    }).catch(() => {
      clearTimeout(timer);
      saved().then(r => finish(r || Response.error()));
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
    return res;
  }));
}
