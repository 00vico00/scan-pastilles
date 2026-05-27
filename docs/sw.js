// === KILL SWITCH ===
// Ce SW remplace l'ancien SW qui servait du contenu cached obsolète.
// Quand Chrome fetch ce sw.js et installe la nouvelle version, l'activate ci-dessous :
// 1) vide TOUS les caches stockés par le SW
// 2) désinstalle le SW lui-même
// 3) recharge toutes les pages ouvertes pour servir le HTML frais depuis le réseau

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      // 1. Vider absolument tous les caches
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch (e) { /* ignore */ }

    try {
      // 2. Forcer le reload de toutes les pages contrôlées par ce SW
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        try { await client.navigate(client.url); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }

    try {
      // 3. Se désinstaller pour ne plus jamais intercepter
      await self.registration.unregister();
    } catch (e) { /* ignore */ }
  })());
});

// Passthrough — ne plus servir de cache pour aucune requête
self.addEventListener('fetch', (event) => {
  // ne rien faire, laisser le browser fetch normalement
});
