// Service worker: injects COOP/COEP/CORP headers on all responses.
// Required for SharedArrayBuffer (FFmpeg.wasm), since GitHub Pages
// does not allow custom server headers.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e =>
  e.waitUntil(self.clients.claim())
);

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(response => {
      if (response.type === 'opaque') return response;
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }).catch(err => {
      console.error('[SW] fetch failed:', e.request.url, err);
      return Response.error();
    })
  );
});
