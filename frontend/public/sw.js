// Supply-Link Service Worker
// Strategies:
//   STATIC  (_next/static/*, /icons/*)  → cache-first
//   VERIFY  (/*/verify/*)               → stale-while-revalidate
//   API     (/api/*)                    → network-first (5 s timeout, no offline fallback)
//   NAV     everything else             → network-first with offline fallback

const STATIC_CACHE = "sl-static-v2";
const DYNAMIC_CACHE = "sl-dynamic-v2";
const OFFLINE_URL = "/offline";

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) =>
        c.addAll([
          "/",
          OFFLINE_URL,
          "/icons/icon-192.png",
          "/icons/icon-512.png",
          "/dashboard",
          "/products",
          "/tracking",
        ])
      )
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const path = url.pathname;

  // 1. Static assets → cache-first
  if (path.startsWith("/_next/static/") || path.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 2. API routes → network-first, no cache fallback
  if (path.startsWith("/api/")) {
    event.respondWith(networkFirst(request, null, 5000));
    return;
  }

  // 3. Verify pages → stale-while-revalidate (offline reading of cached products)
  if (path.includes("/verify/")) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    return;
  }

  // 4. Navigation → network-first with offline page fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE, 5000));
    return;
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const { title = "Supply-Link", body = "", url = "/" } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const match = clients.find((c) => c.url === url && "focus" in c);
        return match ? match.focus() : self.clients.openWindow(url);
      })
  );
});

// ── Background sync ───────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "offline-queue") {
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  const db = await openSyncDB();
  const tx = db.transaction("sync-queue", "readwrite");
  const store = tx.objectStore("sync-queue");
  const records = await idbGetAll(store);

  await Promise.all(
    records.map(async (record) => {
      try {
        const response = await fetch(record.url, {
          method: record.method,
          headers: record.headers,
          body: record.body,
        });
        if (response.ok) {
          await idbDelete(store, record.id);
        }
      } catch {
        // Leave in queue to retry next sync
      }
    })
  );
}

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sl-sync", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("sync-queue")) {
        req.result.createObjectStore("sync-queue", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(store, id) {
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  return cached ?? fetchPromise;
}

async function networkFirst(request, cacheName, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok && cacheName) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    clearTimeout(timer);
    if (cacheName) {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    // Navigation fallback
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response("Offline", { status: 503 });
  }
}
