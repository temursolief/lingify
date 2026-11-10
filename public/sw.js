/*
 * Lingify service worker.
 * - App files (/_next/static, icons, deck media) come from the cache first: they never change, so the app opens fast.
 * - Pages always come from the network (they are personal and change often). If the network is down,
 *   the offline app at /offline is shown instead, with the flashcards and passages saved on the laptop.
 */
const VERSION = "v2";
const STATIC_CACHE = `lingify-static-${VERSION}`;
const OFFLINE_CACHE = `lingify-offline-${VERSION}`;
const OFFLINE_URL = "/offline";
const STATIC_FILES = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

async function cacheOfflinePage() {
  const res = await fetch(OFFLINE_URL, { cache: "no-store" });
  if (!res.ok) return;
  const html = await res.clone().text();
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  const offline = await caches.open(OFFLINE_CACHE);
  await offline.put(OFFLINE_URL, res);
  const statics = await caches.open(STATIC_CACHE);
  await statics.addAll([...STATIC_FILES, ...assets]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflinePage().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(STATIC_CACHE)).put(request, res.clone());
  return res;
}

async function page(request, url) {
  try {
    const res = await fetch(request);
    // Keep the offline app current whenever it is opened online.
    if (url.pathname === OFFLINE_URL && res.ok) cacheOfflinePage().catch(() => {});
    return res;
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Deck images and sounds never change once imported.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/api/media/") || STATIC_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(page(request, url));
  }
});
