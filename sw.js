const CACHE_NAME = 'nextplan-shell-v11-home-all-projects';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

function patchHomeProjects(html) {
  const start = html.indexOf('function renderHome(){');
  const end = html.indexOf('\nfunction projectCard', start);
  if (start < 0 || end < 0) return html;

  let block = html.slice(start, end);
  block = block.replace('const home=ps.slice(0,8);', 'const home=ps;');
  block = block.replace(/\+`<button class="empty-project"[\s\S]*?<\/button>`/, '');
  return html.slice(0, start) + block + html.slice(end);
}

function htmlResponse(response, text) {
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

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
      fetch(request, {cache:'no-store'}).then(async response => {
        const raw = await response.text();
        const patched = patchHomeProjects(raw);
        const out = htmlResponse(response, patched);
        const copy = out.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
        return out;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request, {cache:'no-store'}).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request))
    );
  }
});
