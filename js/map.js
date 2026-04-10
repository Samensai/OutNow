// js/map.js — Carte Leaflet OutNow

var mapInstance = null;
var mapMarkers = [];
var mapSelectedDate = null;

function initMap() {
  if (mapInstance) return;

  mapInstance = L.map('map-container', {
    center: [48.8566, 2.3522],
    zoom: 13,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(mapInstance);

  // Centre sur la position de l'utilisateur si dispo
  if (USER_LOCATION) {
    mapInstance.setView([USER_LOCATION.lat, USER_LOCATION.lng], 13);
    L.circleMarker([USER_LOCATION.lat, USER_LOCATION.lng], {
      radius: 8, fillColor: '#ff3b5c', color: '#fff',
      weight: 2, fillOpacity: 1
    }).addTo(mapInstance).bindPopup('Vous êtes ici');
  }

  renderMapEvents();
}

function renderMapEvents() {
  if (!mapInstance) return;

  // Supprime les anciens markers
  mapMarkers.forEach(function(m) { mapInstance.removeLayer(m); });
  mapMarkers = [];

  var filtered = EVENTS.filter(function(e) {
    if (!e.lat || !e.lng) return false;
    if (mapSelectedDate) {
      if (!e.dateISO) return false;
      var evDate = new Date(e.dateISO).toDateString();
      var selDate = new Date(mapSelectedDate).toDateString();
      if (evDate !== selDate) return false;
    }
    return true;
  });

  // Icône personnalisée selon catégorie
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

  // Ajuste la vue pour montrer tous les markers
  if (mapMarkers.length > 0 && !mapSelectedDate) {
    var group = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.1));
  }
}

window.openDetailFromMap = function(eventId) {
  var ev = EVENTS.find(function(e) { return e.id === eventId; });
  if (!ev) return;
  previousScreen = 'map';
  openDetail(ev);
};

function openMapScreen() {
  showScreen('map');
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.remove('active');
  });

  // Init carte après que l'écran soit visible
  setTimeout(function() {
    initMap();
    if (mapInstance) mapInstance.invalidateSize();
  }, 100);
}

// Filtre par date
function setMapDate(dateStr) {
  mapSelectedDate = dateStr || null;
  renderMapEvents();
}
