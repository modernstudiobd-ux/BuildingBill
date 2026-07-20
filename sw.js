const CACHE_VERSION = 'invoicer-v12';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './lib/qrcode.min.js',
  './js/app.js',
  './js/state.js',
  './js/invoice-renderer.js',
  './js/components/header.js',
  './js/components/sidebar-form.js',
  './js/components/preview.js',
  './js/components/mobile-tabs.js',
  './js/components/bottom-action-bar.js',
  './js/components/history-modal.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './favicon.ico'
];
// No third-party runtime hosts needed — Print/Download now use the browser's
// native print pipeline instead of a CDN-hosted PDF library, so the app shell
// above is fully self-contained and works offline after the first load.
const RUNTIME_HOSTS = [];

// Files that change often (app code) use network-first, so a new deployment is
// picked up on the very next load instead of being stuck behind a stale cache.
const NETWORK_FIRST = ['.html', '.js', '.css', '.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function isNetworkFirst(pathname) {
  return NETWORK_FIRST.some((ext) => pathname.endsWith(ext)) || pathname === '/' || pathname.endsWith('/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only ever handle http/https requests — the Cache API throws on schemes like
  // chrome-extension:, data:, or blob:, which can otherwise reach this handler
  // via browser extensions or embedded resources and break the fetch event.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const isRuntimeLib = RUNTIME_HOSTS.includes(url.hostname);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin && !isRuntimeLib) return; // let unrelated cross-origin requests pass through normally

  const networkFirst = isSameOrigin && (req.mode === 'navigate' || isNetworkFirst(url.pathname));

  if (networkFirst) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() =>
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
    );
    return;
  }

  // Cache-first for rarely-changing assets: icons, fonts, and CDN libraries.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});
