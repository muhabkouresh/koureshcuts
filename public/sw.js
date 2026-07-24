// Service worker: installability, an offline fallback, and fast repeat loads.
// - Hashed build assets (/_next/static) and images are cache-first: they are
//   immutable, so serving from cache makes app launches near-instant.
// - Page navigations are stale-while-revalidate: the last cached copy is
//   served instantly (the installed app opens without waiting on the network
//   or a cold serverless start), then refreshed in the background. Live data
//   — availability, the admin day plan — is always fetched client-side, so a
//   one-launch-old shell is never a correctness problem.
// - API requests are never touched — availability must always be live.
const CACHE = "koureshcuts-v3";
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
    // Stale-while-revalidate: hand back the cached page immediately when we
    // have one (instant app open), while a background fetch refreshes it for
    // next time. With no cache yet, wait for the network and fall back to the
    // cached start page when offline. Also covers /admin, so the owner's day
    // plan opens instantly and survives a Wi-Fi drop (device-local cache).
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const networkFetch = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(networkFetch);
          return cached;
        }
        const fresh = await networkFetch;
        return fresh || (await cache.match(FALLBACK)) || Response.error();
      })(),
    );
  }
});

// Web-Push: admin notifications (new bookings etc., default target /admin)
// and customer "Termin-Radar" alerts (payload carries url: "/").
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — show a generic notification below.
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || "Kouresh_cuts", {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/admin" },
      });
      // Relay to open pages so the admin dashboard refreshes instantly.
      const wins = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      wins.forEach((w) => w.postMessage({ type: "kc:refresh" }));
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) =>
        url === "/" ? true : w.url.includes(url),
      );
      if (existing) return existing.focus();
      return clients.openWindow(url);
    }),
  );
});
