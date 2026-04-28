/* eslint-disable no-restricted-globals */
/* ShelfWise service worker
   - Caches the app shell for offline use (network-first for navigations, cache-first for static assets)
   - Listens for push events and renders notifications
   - Handles notification clicks → focus existing tab or open root
*/

const CACHE = "shelfwise-v1";
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never intercept API calls
  if (url.pathname.startsWith("/api/")) return;

  // SPA navigations: network first, fallback to cached index
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res.ok && (url.origin === self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

self.addEventListener("push", (e) => {
  let data = { title: "ShelfWise", body: "You have a new notification", url: "/" };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}
  const opts = {
    body: data.body,
    badge: "/favicon.ico",
    icon: "/favicon.ico",
    data: { url: data.url || "/" },
    tag: data.tag || "shelfwise-alert",
    renotify: true,
  };
  e.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(target); return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});
