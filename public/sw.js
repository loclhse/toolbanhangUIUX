// Service Worker for performance optimization
const CACHE_NAME = 'orders-app-v1';
const API_CACHE_NAME = 'api-cache-v1';

// Cache static assets
const STATIC_ASSETS = [
  '/',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/pages/OrdersPage.tsx'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/orders',
  '/api/tables',
  '/api/food-items'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests with cache-first strategy for GET requests
  if (url.pathname.includes('/api/') && request.method === 'GET') {
    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached response immediately
            fetch(request).then((networkResponse) => {
              // Update cache in background
              if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
            }).catch(() => {
              // Network failed, cached response is still valid
            });
            return cachedResponse;
          }

          // No cache, fetch from network
          return fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Handle static assets with cache-first strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      return cachedResponse || fetch(request);
    })
  );
});