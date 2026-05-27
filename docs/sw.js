// Service Worker — stratégie network-first pour la page HTML et passthrough pour le reste.
// Objectif : les opérateurs reçoivent automatiquement la dernière version sans avoir à vider le cache.

const CACHE_NAME = 'scan-pastilles-shell';
const SHELL_URLS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Nettoyer les anciens caches au cas où le nom change un jour
      caches.keys().then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Requêtes vers Apps Script (POST sync) — laisser passer, ne pas toucher.
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('script.googleusercontent.com')) {
    return;
  }

  // 2) Page HTML (navigation) → network-first, fallback cache si offline.
  const isNavigation = req.mode === 'navigate' ||
    (req.destination === 'document') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html');

  if (isNavigation && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          // Met à jour le cache avec la dernière version reçue
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', respClone).catch(() => {}));
          return resp;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 3) Tout le reste (CDN unpkg, fonts, etc.) → cache-first, mais on tolère l'échec.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
            const respClone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, respClone).catch(() => {}));
          }
          return resp;
        })
        .catch(() => cached);
    })
  );
});
