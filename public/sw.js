// Service worker: installability, an offline fallback, and fast repeat loads.
// - Hashed build assets (/_next/static) and images are cache-first: they are
//   immutable, so serving from cache makes app launches near-instant.
// - Page navigations stay network-first (fresh HTML), falling back to the
//   last cached copy when offline. Admin pages are never cached (private).
// - API requests are never touched — availability must always be live.
const CACHE = "koureshcuts-v2";
const FALLBACK = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([FALLBACK, "/logo.png", "/icon-192.png", "/icon-512.png"]),
      )
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

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept APIs or anything under /admin (private, always fresh).
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for build assets and images: hashed filenames never change.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const isAdmin = url.pathname.startsWith("/admin");
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep the last good copy of public pages for offline use.
          if (res.ok && !isAdmin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match(FALLBACK)),
        ),
    );
  }
});

// Web-Push for the admin PWA: show incoming booking/cancellation notifications.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — show a generic notification below.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Kouresh_cuts", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes("/admin"));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    }),
  );
});
