// js/map.js — Carte Leaflet OutNow

var mapInstance = null;
var mapMarkers = [];
var mapSelectedDate = null;
var mapUserMarker = null;

function showMapLoading(message) {
  var loadingEl = document.getElementById('map-loading');
  if (!loadingEl) return;
  loadingEl.style.display = 'flex';
  loadingEl.innerHTML = '<div style="font-size:32px">🗺️</div>' + message;
}

function hideMapLoading() {
  var loadingEl = document.getElementById('map-loading');
  if (!loadingEl) return;
  loadingEl.style.display = 'none';
}

function toggleMapSearchButton(show) {
  var btn = document.getElementById('btn-map-search-here');
  if (!btn) return;
  btn.classList.toggle('hidden', !show);
}

function getMapEventDateKey(ev) {
  if (!ev) return null;
  if (ev.dateISO && typeof ev.dateISO === 'string') {
    return ev.dateISO.slice(0, 10);
  }
  return null;
}

function getMapSourceEvents() {
  var merged = [];
  var seen = {};

  (EVENTS || []).forEach(function(ev) {
    if (!ev || !ev.id) return;
    seen[String(ev.id)] = true;
    merged.push(ev);
  });

  if (state && Array.isArray(state.liked)) {
    state.liked.forEach(function(ev) {
      if (!ev || !ev.id) return;
      if (seen[String(ev.id)]) return;
      seen[String(ev.id)] = true;
      merged.push(ev);
    });
  }

  return merged;
}

function initMap() {
  if (mapInstance) return;

  mapInstance = L.map('map-container', {
    center: [USER_LOCATION.lat, USER_LOCATION.lng],
    zoom: 13,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(mapInstance);

  var userIcon = L.divIcon({
    html: '<div style="position:relative;width:24px;height:24px">' +
      '<div style="position:absolute;inset:0;background:#3b82f6;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(59,130,246,0.6)"></div>' +
      '<div style="position:absolute;inset:-6px;background:rgba(59,130,246,0.2);border-radius:50%;animation:pulse 2s infinite"></div>' +
    '</div>',
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  mapUserMarker = L.marker([USER_LOCATION.lat, USER_LOCATION.lng], {
    icon: userIcon,
    zIndexOffset: 1000
  }).addTo(mapInstance).bindPopup('<b>Vous êtes ici</b>');

  mapInstance.on('moveend', function() {
    toggleMapSearchButton(true);
  });

  mapInstance.on('zoomend', function() {
    toggleMapSearchButton(true);
  });

  renderMapEvents();
}

function renderMapEvents() {
  if (!mapInstance) return;

  mapMarkers.forEach(function(m) {
    mapInstance.removeLayer(m);
  });
  mapMarkers = [];

  var bounds = mapInstance.getBounds();
  var sourceEvents = getMapSourceEvents();

  var filtered = sourceEvents.filter(function(e) {
    if (!e || !e.lat || !e.lng) return false;

    if (mapSelectedDate) {
      var eventDateKey = getMapEventDateKey(e);
      if (!eventDateKey || eventDateKey !== mapSelectedDate) return false;
    }

    return bounds.contains([e.lat, e.lng]);
  });

  var catColors = {
    concert: '#ff3b5c',
    expo: '#a855f7',
    sport: '#22c55e',
    food: '#f97316',
    soiree: '#3b82f6'
  };

  filtered.forEach(function(ev) {
    var color = catColors[ev.category] || '#ff3b5c';

    var icon = L.divIcon({
      html: '<div style="background:' + color + ';width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    var marker = L.marker([ev.lat, ev.lng], { icon: icon })
      .addTo(mapInstance)
      .bindPopup(
        '<div style="font-family:DM Sans,sans-serif;min-width:180px">' +
        '<img src="' + ev.image + '" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-bottom:8px" />' +
        '<div style="font-weight:700;font-size:13px;margin-bottom:4px">' + ev.title + '</div>' +
        '<div style="font-size:11px;color:#888;margin-bottom:4px">' + ev.date + '</div>' +
        '<div style="font-size:11px;color:#888;margin-bottom:8px">' + ev.location + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-weight:700;color:#ff3b5c">' + ev.priceLabel + '</span>' +
          '<button onclick="openDetailFromMap(' + ev.id + ')" style="background:#ff3b5c;color:#fff;border:none;padding:5px 10px;border-radius:8px;font-size:12px;cursor:pointer">Voir</button>' +
        '</div>' +
        '</div>',
        { maxWidth: 220 }
      );

    mapMarkers.push(marker);
  });

  toggleMapSearchButton(false);
}

window.openDetailFromMap = function(eventId) {
  var sourceEvents = getMapSourceEvents();
  var ev = sourceEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  previousScreen = 'map';
  openDetail(ev);
};

function openMapScreen() {
  showScreen('map');
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.remove('active');
  });

  showMapLoading('Autorise la localisation pour utiliser la carte');

  requestUserLocation().then(function(location) {
    if (!location) {
      showMapLoading('Autorise la localisation pour utiliser la carte');
      return;
    }

    function finishMapOpen() {
      hideMapLoading();

      if (!mapInstance) {
        initMap();
      } else {
        mapInstance.setView([USER_LOCATION.lat, USER_LOCATION.lng], 13);
        if (mapUserMarker) {
          mapUserMarker.setLatLng([USER_LOCATION.lat, USER_LOCATION.lng]);
        }
        renderMapEvents();
      }

      setTimeout(function() {
        if (mapInstance) mapInstance.invalidateSize();
      }, 100);
    }

    function loadAll() {
      if (EVENTS_EXHAUSTED) {
        finishMapOpen();
        return;
      }

      loadEvents().then(function() {
        buildDeck();

        EVENTS.forEach(function(e) {
          if (e.lat && e.lng && USER_LOCATION) {
            e.distanceKm = getDistanceKm(USER_LOCATION.lat, USER_LOCATION.lng, e.lat, e.lng);
            e.distance = formatDistance(e.distanceKm);
          }
        });

        if (!EVENTS_EXHAUSTED) {
          loadAll();
        } else {
          finishMapOpen();
        }
      });
    }

    loadAll();
  });
}

function setMapDate(dateStr) {
  mapSelectedDate = dateStr || null;
  renderMapEvents();
}

document.addEventListener('DOMContentLoaded', function() {
  var btnSearchHere = document.getElementById('btn-map-search-here');
  if (btnSearchHere) {
    btnSearchHere.addEventListener('click', function() {
      renderMapEvents();
    });
  }
});
