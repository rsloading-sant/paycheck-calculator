// Lives at the site root so its scope is "/" and the app shell really works offline.
// Strategy: network-first for the app's own code (so fixes reach users immediately,
// falling back to cache offline); cache-first for immutable vendor files, fonts, icons.
// Same-origin only: nothing from other sites is ever cached.
const CACHE = "paycheck-calculator-v8";
const ASSETS = [
  "/",
  "/index.html",
  "/src/paycheck-calculator.jsx",
  "/src/main.jsx",
  "/sw-register.js",
  "/analytics-init.js",
  "/public/manifest.json",
  "/public/icons/icon-192.png",
  "/public/icons/icon-512.png",
  "/vendor/react.production.min.js",
  "/vendor/react-dom.production.min.js",
  "/vendor/babel.min.js",
  "/vendor/fonts.css",
  "/vendor/fonts/dm-mono-latin-300-normal.woff2",
  "/vendor/fonts/dm-mono-latin-400-normal.woff2",
  "/vendor/fonts/dm-mono-latin-500-normal.woff2",
  "/vendor/fonts/bebas-neue-latin-400-normal.woff2",
  "/vendor/fonts/allura-latin-400-normal.woff2"
];
const IMMUTABLE = /^\/(vendor|public\/icons)\//;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // never touch other origins
  if (url.pathname.startsWith("/_vercel/")) return;      // analytics goes straight to network

  const store = (res) => {
    if (res && res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };

  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(store)));
  } else {
    event.respondWith(
      fetch(req).then(store).catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("/index.html"))
      )
    );
  }
});
