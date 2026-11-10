/*
 * Lingify service worker.
 * - App files (/_next/static, icons, deck media) come from the cache first: they never change, so the app opens fast.
 * - Pages always come from the network (they are personal and change often). If the network is down,
 *   the offline app at /offline is shown instead, with the flashcards and passages saved on the device.
 */
const VERSION = "v3";
const STATIC_CACHE = `lingify-static-${VERSION}`;
const OFFLINE_CACHE = `lingify-offline-${VERSION}`;
// Deck images and sounds are kept across updates of the app: they are large and never change.
const MEDIA_CACHE = "lingify-media-v1";
// App files of older releases are dropped once the cache holds this many.
const MAX_STATIC = 300;
const OFFLINE_URL = "/offline";
const STATIC_FILES = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

/**
 * The offline app and every file it needs live in their own cache, replaced as a whole, so trimming the cache of
 * app files can never take a piece of it away.
 */
async function cacheOfflinePage() {
  const res = await fetch(OFFLINE_URL, { cache: "no-store" });
  if (!res.ok) return;
  const html = await res.clone().text();
  const files = [...STATIC_FILES, ...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  const offline = await caches.open(OFFLINE_CACHE);
  await offline.addAll(files);
  await offline.put(OFFLINE_URL, res);
  const keep = new Set([OFFLINE_URL, ...files].map((f) => new URL(f, self.location.origin).href));
  const stale = (await offline.keys()).filter((k) => !keep.has(k.url));
  await Promise.all(stale.map((k) => offline.delete(k)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflinePage().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== OFFLINE_CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Oldest first: every release adds new file names, so without this the cache would only grow. */
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC)).map((k) => cache.delete(k)));
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  // 200 only: a partial answer (206, a sound being seeked) cannot be stored.
  if (res.status === 200) {
    const copy = res.clone();
    caches
      .open(cacheName)
      .then(async (cache) => {
        await cache.put(request, copy);
        if (cacheName === STATIC_CACHE) await trim(cache);
      })
      .catch(() => {});
  }
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

  if (url.pathname.startsWith("/api/media/")) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
  } else if (url.pathname.startsWith("/_next/static/") || STATIC_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (request.mode === "navigate") {
    event.respondWith(page(request, url));
  }
});
