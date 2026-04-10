var EVENTS = [];
var EVENTS_LOADING = false;
var EVENTS_EXHAUSTED = false;
var SEEN_IDS = {};
var USER_LOCATION = null; // { lat, lng }

var OPENAGENDA_KEY = "TA_CLE_ICI";
var TODAY = new Date().toISOString().split('T')[0];

var AGENDAS = [
  { uid: 61665301, cursor: null, done: false },
  { uid: 52870970, cursor: null, done: false },
  { uid: 85121895, cursor: null, done: false },
  { uid: 14898606, cursor: null, done: false },
  { uid: 20272888, cursor: null, done: false },
  { uid: 39308038, cursor: null, done: false }
];

// ── GÉOLOCALISATION ──
function requestUserLocation() {
  return new Promise(function(resolve) {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        USER_LOCATION = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        resolve(USER_LOCATION);
      },
      function() { resolve(null); },
      { timeout: 8000, maximumAge: 300000 }
    );
  });
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + ' m';
  return km.toFixed(1) + ' km';
}

// ── DÉTECTION DU PRIX ──
function detectPrice(e) {
  var text = '';
  if (e.title && e.title.fr) text += e.title.fr + ' ';
  if (e.description && e.description.fr) text += e.description.fr + ' ';
  if (e.conditions && e.conditions.fr) text += e.conditions.fr + ' ';
  text = text.toLowerCase();

  // Gratuit
  if (text.match(/gratuit|entrée libre|entrée gratuite|free|sans frais|accès libre/)) {
    return { price: 0, priceLabel: 'Gratuit' };
  }

  // Cherche un prix en euros
  var euroMatch = text.match(/(\d+(?:[.,]\d+)?)\s*€/);
  if (euroMatch) {
    var amount = parseFloat(euroMatch[1].replace(',', '.'));
    return { price: amount, priceLabel: amount + ' €' };
  }

  // Champ registration
  if (e.registration && e.registration.length > 0) {
    var reg = e.registration[0];
    if (reg.type === 'free') return { price: 0, priceLabel: 'Gratuit' };
    if (reg.value) return { price: parseFloat(reg.value) || 5, priceLabel: reg.value + ' €' };
    return { price: 5, priceLabel: 'Payant' };
  }

  // Par défaut : inconnu
  return { price: 0, priceLabel: 'Voir détails' };
}

// ── CHARGEMENT DES EVENTS ──
function loadEvents() {
  if (EVENTS_LOADING || EVENTS_EXHAUSTED) return Promise.resolve();
  EVENTS_LOADING = true;

  var now = new Date();
  var activeAgendas = AGENDAS.filter(function(a) { return !a.done; });
  if (activeAgendas.length === 0) {
    EVENTS_EXHAUSTED = true;
    EVENTS_LOADING = false;
    return Promise.resolve();
  }

  var promises = activeAgendas.map(function(agenda) {
    var url = 'https://api.openagenda.com/v2/agendas/' + agenda.uid + '/events'
      + '?key=' + OPENAGENDA_KEY
      + '&size=20&lang=fr&timings[gte]=' + TODAY;
    if (agenda.cursor) {
      agenda.cursor.forEach(function(val) {
        url += '&after[]=' + encodeURIComponent(val);
      });
    }
    return fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.after && data.after.length > 0) agenda.cursor = data.after;
        else agenda.done = true;
        return data.events || [];
      })
      .catch(function() { agenda.done = true; return []; });
  });

  return Promise.all(promises).then(function(results) {
    var all = [];
    results.forEach(function(evts) { all = all.concat(evts); });

    var newEvents = all.filter(function(e) {
      if (SEEN_IDS[e.uid]) return false;
      var timing = e.firstTiming || e.nextTiming || e.lastTiming;
      if (timing && timing.begin && new Date(timing.begin) < now) return false;
      SEEN_IDS[e.uid] = true;
      return true;
    }).map(function(e, i) {
      var title = (e.title && (e.title.fr || e.title.en)) || 'Evenement';
      var desc = (e.description && (e.description.fr || e.description.en)) || '';
      var loc = (e.location && (e.location.name || e.location.city)) || 'Paris';
      var city = (e.location && e.location.city) || '';
      var lat = (e.location && e.location.latitude) || null;
      var lng = (e.location && e.location.longitude) || null;

      var image = fallbackImage(Object.keys(SEEN_IDS).length + i);
      if (e.image && e.image.base && e.image.filename) {
        image = e.image.base + e.image.filename;
      }

      var priceInfo = detectPrice(e);

      var dateStr = 'Prochainement';
      var dateISO = null;
      var timing = e.firstTiming || e.nextTiming || e.lastTiming;
      if (timing && timing.begin) {
        dateISO = timing.begin;
        var d = new Date(timing.begin);
        dateStr = d.toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long',
          hour: '2-digit', minute: '2-digit'
        });
      }

      var keywords = [];
      if (e.keywords && e.keywords.fr) {
        keywords = Array.isArray(e.keywords.fr) ? e.keywords.fr : [e.keywords.fr];
      }
      var cat = detectCategory(keywords, title, desc);
      var tags = keywords.slice(0, 3);
      if (tags.length === 0) tags = [cat];

      // Distance
      var distanceKm = null;
      var distanceLabel = 'Paris';
      if (USER_LOCATION && lat && lng) {
        distanceKm = getDistanceKm(USER_LOCATION.lat, USER_LOCATION.lng, lat, lng);
        distanceLabel = formatDistance(distanceKm);
      }

      return {
        id: e.uid || (Date.now() + i),
        title: title,
        category: cat,
        tags: tags,
        date: dateStr,
        dateISO: dateISO,
        location: loc + (city && loc.indexOf(city) === -1 ? ', ' + city : ''),
        lat: lat,
        lng: lng,
        distance: distanceLabel,
        distanceKm: distanceKm,
        price: priceInfo.price,
        priceLabel: priceInfo.priceLabel,
        image: image,
        description: desc,
        liked: false
      };
    });

    EVENTS = EVENTS.concat(newEvents);
    if (AGENDAS.every(function(a) { return a.done; })) EVENTS_EXHAUSTED = true;
    EVENTS_LOADING = false;
    console.log('OutNow: ' + EVENTS.length + ' evenements charges.');
  });
}

function detectCategory(keywords, title, desc) {
  var text = (keywords.join(' ') + ' ' + title + ' ' + desc).toLowerCase();
  if (text.match(/concert|musique|live|festival|dj|jazz|rock|electro|classique/)) return 'concert';
  if (text.match(/expo|exposition|art|musee|galerie|photo|peinture/)) return 'expo';
  if (text.match(/sport|foot|basket|tennis|volley|course|yoga|danse/)) return 'sport';
  if (text.match(/food|gastronomie|marche|cuisine|restaurant|degustation/)) return 'food';
  return 'soiree';
}

function fallbackImage(i) {
  var imgs = [
    'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80',
    'https://images.unsplash.com/photo-1580136579312-94651dfd596d?w=600&q=80',
    'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=600&q=80',
    'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=600&q=80',
    'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&q=80',
    'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=600&q=80',
    'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=600&q=80'
  ];
  return imgs[i % imgs.length];
}
