const STATIC_CACHE_NAME = 'vaerstasjonen-static-v5';

const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
      self.skipWaiting(),
    ])
  );
});

self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE_NAME];
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) =>
            currentCaches.includes(name) ? Promise.resolve(false) : caches.delete(name)
          )
        )
      ),
      self.clients.claim(),
    ])
  );
});

function canCache(response) {
  return response && response.ok && response.type === 'basic';
}

async function cacheResponse(request, response) {
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.put(request, response);
  } catch {
    // A full or unavailable browser cache must never turn a successful request
    // into an application error.
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!url.protocol.startsWith('http') || url.origin !== self.location.origin) return;

  // Mutations, authentication and live/private API data must always reach the server.
  // Returning an explicit offline error is safer than presenting stale weather as current.
  if (url.pathname.startsWith('/api/')) {
    if (event.request.method === 'GET') {
      event.respondWith(
        fetch(event.request).catch(() =>
          new Response(
            JSON.stringify({
              error: 'Ingen nettverkstilkobling. Live værdata er utilgjengelig.',
              offline: true,
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            }
          )
        )
      );
    }
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then(async (networkResponse) => {
          if (canCache(networkResponse)) {
            await cacheResponse(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(
            '<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Frakoblet</title><body><main><h1>Ingen nettverkstilkobling</h1><p>Værdata og innlogging krever nettverk. Koble til nettet og åpne appen på nytt.</p></main></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
  }
});
