// Minimal service worker for installability + an offline fallback.
// Network-first for page navigations; falls back to a cached home page when
// the device is offline. API and dynamic requests are never served stale.
const CACHE = "koureshcuts-v1";
const FALLBACK = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([FALLBACK, "/logo.png"]))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((cached) => cached || caches.match(FALLBACK)),
      ),
    );
  }
});
