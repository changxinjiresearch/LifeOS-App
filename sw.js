const CACHE_NAME = 'nextplan-shell-v8-current-action';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './current-action.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then(async response => {
        const text = await response.clone().text();
        const injected = text.includes('current-action.js')
          ? text
          : text.replace('</body>', '<script src="./current-action.js?v=20260912"></script></body>');
        const headers = new Headers(response.headers);
        headers.set('content-type', 'text/html; charset=utf-8');
        const modified = new Response(injected, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', modified.clone()));
        return modified;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request))
    );
  }
});
