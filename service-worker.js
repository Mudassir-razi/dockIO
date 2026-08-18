/* Portable Documentation offline cache */
const CACHE_NAME = "portable-docs-v19";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=19",
  "./app.js",
  "./app.js?v=19",
  "./manifest.webmanifest",
  "./vendor/marked.umd.js",
  "./vendor/blockio.js",
  "./vendor/blockio.js?v=18",
  "./vendor/monaco/vs/loader.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && new URL(request.url).origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // Prefer cache for Monaco chunks once seen; otherwise network-first with fallback.
      if (cached && request.url.includes("/vendor/monaco/")) return cached;
      return cached || network;
    })
  );
});
