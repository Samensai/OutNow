const CACHE = 'outnow-v6';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/supabase.js',
  './js/auth.js',
  './js/push.js',
  './js/friends.js',
  './js/groups.js',
  './js/map.js',
  './data/events.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; }).map(function(k) {
          return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (!/^https?:/i.test(e.request.url)) {
    return;
  }

  if (e.request.url.match(/\.(js|css)(\?|$)/)) {
    e.respondWith(
      fetch(e.request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, clone).catch(function() {});
          });
          return response;
        })
        .catch(function() {
          return caches.match(e.request);
        })
    );
    return;
  }

  if (e.request.destination === 'image') {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});

self.addEventListener('push', function(event) {
  var data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'OutNow',
      body: event.data ? event.data.text() : ''
    };
  }

  var targetUrl;
  try {
    targetUrl = new URL(data.url || './', self.registration.scope).toString();
  } catch (e) {
    targetUrl = new URL('./', self.registration.scope).toString();
  }

  var title = data.title || 'OutNow';
  var options = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'outnow',
    data: {
      url: targetUrl,
      groupId: data.groupId || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : new URL('./', self.registration.scope).toString();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client && 'focus' in client) {
          client.postMessage({
            type: 'OPEN_FROM_PUSH',
            url: targetUrl,
            groupId: event.notification.data && event.notification.data.groupId
          });
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
