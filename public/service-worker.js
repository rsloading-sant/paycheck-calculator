/* Offline cache for the Paycheck Calculator app shell.
   NOTE: this file is registered from public/service-worker.js, so its
   scope is /public/. For the service worker to cache and serve the whole
   app offline (including /index.html), serve this file from the site root
   instead, or move it to the repo root. */
const CACHE = "paycheck-calculator-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/src/app.js",
  "/src/styles.css",
  "/public/manifest.json",
  "/public/icons/icon-192.png",
  "/public/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
