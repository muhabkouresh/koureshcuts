// Only public navigation may be cached. Private plans always come from the server.
const CACHE = "koureshcuts-v4";
const FALLBACK = "/";
const PUBLIC_PAGES = new Set(["/", "/datenschutz", "/app"]);
function isPrivate(url) {
  return url.pathname.startsWith("/admin") || url.pathname.startsWith("/meine-termine") ||
    url.pathname.startsWith("/termin/") || !PUBLIC_PAGES.has(url.pathname) || Boolean(url.search);
}
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([FALLBACK, "/logo.png", "/icon-192.png", "/icon-512.png"])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // v3 contained private HTML. Remove it, including after an in-place update.
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("koureshcuts-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach(client => client.postMessage({ type: "kc:refresh" }));
  })());
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate" && isPrivate(url)) {
    event.respondWith(fetch(req, { cache: "no-store" }).catch(() => new Response(
      '<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verbindung erforderlich</title><body><main><h1>Internetverbindung erforderlich</h1><p>Deine privaten Termine werden zu deinem Schutz nicht offline gespeichert. Stelle die Verbindung wieder her und lade diese Seite erneut.</p><p><a href="">Erneut laden</a></p></main></body></html>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    )));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy))); }
      return res;
    })));
    return;
  }
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
    // Unversioned images must revalidate, unlike hashed build files.
    const network = fetch(req).then(async res => {
      if (res.ok) { const cache = await caches.open(CACHE); await cache.put(req, res.clone()); }
      return res;
    }).catch(() => null);
    event.waitUntil(network);
    event.respondWith(caches.match(req).then(async cached => cached || await network || Response.error()));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // A redirected response might be a login/personal page. Never persist it.
        if (res.ok && !res.redirected) {
          const cache = await caches.open(CACHE);
          await cache.put(req, res.clone());
        }
        return res;
      } catch {
        return await caches.match(req) || await caches.match(FALLBACK) || Response.error();
      }
    })());
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
