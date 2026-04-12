var EVENTS = [];
var EVENTS_LOADING = false;
var EVENTS_EXHAUSTED = false;
var USER_LOCATION = null;

var OPENAGENDA_KEY = "6cf33cc591df40a9b0fac2a946d4c3ec";
var TODAY = new Date().toISOString().split('T')[0];

var DATATOURISME_FLOW_URL = 'https://ivpgtkvyjnwkivcegmej.supabase.co/functions/v1/datatourisme-proxy';
var DATATOURISME_LOADING = false;
var DATATOURISME_LOADED = false;

var CITIES = {
  paris:    { label: 'Paris',    agendas: [61665301, 52870970, 85121895, 14898606, 20272888, 39308038, 95716291] },
  bordeaux: { label: 'Bordeaux', agendas: [1108324, 83392987] },
  lille:    { label: 'Lille',    agendas: [57621068] },
  nantes:   { label: 'Nantes',   agendas: [82470621] },
  rennes:   { label: 'Rennes',   agendas: [20500020] }
};

var SELECTED_CITIES = [];
var AGENDAS = [];
var LOADED_EVENT_IDS = {};
var SEEN_IDS = {};

try {
  var savedCities = localStorage.getItem('outnow_cities');
  SELECTED_CITIES = savedCities ? JSON.parse(savedCities) : ['paris'];
} catch (e) {
  SELECTED_CITIES = ['paris'];
}
if (!SELECTED_CITIES || !SELECTED_CITIES.length) SELECTED_CITIES = ['paris'];

try {
  var savedSeenIds = localStorage.getItem('outnow_seen_event_ids');
  SEEN_IDS = savedSeenIds ? JSON.parse(savedSeenIds) : {};
} catch (e) {
  SEEN_IDS = {};
}

function saveSeenIds() {
  try {
    localStorage.setItem('outnow_seen_event_ids', JSON.stringify(SEEN_IDS));
  } catch (e) {}
}

function markEventSeen(eventId) {
  if (!eventId) return;
  SEEN_IDS[String(eventId)] = true;
  saveSeenIds();
}

function isEventSeen(eventId) {
  return !!SEEN_IDS[String(eventId)];
}

function buildAgendaList() {
  var seenAgendaIds = {};
  AGENDAS = [];

  SELECTED_CITIES.forEach(function(cityKey) {
    if (!CITIES[cityKey]) return;
    CITIES[cityKey].agendas.forEach(function(uid) {
      if (seenAgendaIds[uid]) return;
      seenAgendaIds[uid] = true;
      AGENDAS.push({ uid: uid, cityKey: cityKey, cursor: null, done: false });
    });
  });
}

function resetLoadedEvents() {
  EVENTS = [];
  LOADED_EVENT_IDS = {};
  EVENTS_LOADING = false;
  EVENTS_EXHAUSTED = false;
  DATATOURISME_LOADED = false;
  DATATOURISME_LOADING = false;
  buildAgendaList();
}

function saveSelectedCities(cities) {
  SELECTED_CITIES = Array.isArray(cities) && cities.length ? cities : ['paris'];
  try {
    localStorage.setItem('outnow_cities', JSON.stringify(SELECTED_CITIES));
  } catch (e) {}

  resetLoadedEvents();
}

function requestUserLocation() {
  return new Promise(function(resolve) {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function(pos) {
        USER_LOCATION = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        resolve(USER_LOCATION);
      },
      function() {
        resolve(null);
      },
      {
        timeout: 8000,
        maximumAge: 300000,
        enableHighAccuracy: true
      }
    );
  });
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + ' m';
  return km.toFixed(1) + ' km';
}

function detectPrice(e) {
  var text = '';
  if (e.title && e.title.fr) text += e.title.fr + ' ';
  if (e.description && e.description.fr) text += e.description.fr + ' ';
  if (e.conditions && e.conditions.fr) text += e.conditions.fr + ' ';
  text = text.toLowerCase();

  if (text.match(/gratuit|entr.e libre|entr.e gratuite|free|sans frais|acc.s libre/)) {
    return { price: 0, priceLabel: 'Gratuit' };
  }

  var euroMatch = text.match(/(\d+(?:[.,]\d+)?)\s*€/);
  if (euroMatch) {
    var amount = parseFloat(euroMatch[1].replace(',', '.'));
    return { price: amount, priceLabel: amount + ' €' };
  }

  if (e.registration && e.registration.length > 0) {
    var reg = e.registration[0];
    if (reg.type === 'free') return { price: 0, priceLabel: 'Gratuit' };
    if (reg.value) return { price: parseFloat(reg.value) || 5, priceLabel: reg.value + ' €' };
    return { price: 5, priceLabel: 'Payant' };
  }

  return { price: 0, priceLabel: 'Voir détails' };
}

function detectCategory(keywords, title, desc) {
  var text = (keywords.join(' ') + ' ' + title + ' ' + desc).toLowerCase();
  if (text.match(/concert|musique|live|festival|dj|jazz|rock|electro|classique/)) return 'concert';
  if (text.match(/expo|exposition|art|musee|musée|galerie|photo|peinture|patrimoine|monument|visite/)) return 'expo';
  if (text.match(/sport|foot|basket|tennis|volley|course|yoga|danse/)) return 'sport';
  if (text.match(/food|gastronomie|marche|marché|cuisine|restaurant|degustation|dégustation/)) return 'food';
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

function toEventCard(e, indexOffset, cityKey) {
  var title = (e.title && (e.title.fr || e.title.en)) || 'Evenement';
  var desc = (e.description && (e.description.fr || e.description.en)) || '';
  var loc = (e.location && (e.location.name || e.location.city)) || '';
  var city = (e.location && e.location.city) || '';
  var lat = (e.location && e.location.latitude) || null;
  var lng = (e.location && e.location.longitude) || null;

  var image = fallbackImage(indexOffset);
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
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  var keywords = [];
  if (e.keywords && e.keywords.fr) {
    keywords = Array.isArray(e.keywords.fr) ? e.keywords.fr : [e.keywords.fr];
  }

  var cat = detectCategory(keywords, title, desc);
  var tags = keywords.slice(0, 3);
  if (tags.length === 0) tags = [cat];

  var distanceKm = null;
  var distanceLabel = city || 'France';
  if (USER_LOCATION && lat && lng) {
    distanceKm = getDistanceKm(USER_LOCATION.lat, USER_LOCATION.lng, lat, lng);
    distanceLabel = formatDistance(distanceKm);
  }

  return {
    id: e.uid || (Date.now() + indexOffset),
    title: title,
    category: cat,
    tags: tags,
    date: dateStr,
    dateISO: dateISO,
    location: loc + (city && loc.indexOf(city) === -1 ? ', ' + city : ''),
    lat: lat,
    lng: lng,
    city: city,
    cityKey: cityKey || e.__cityKey || null,
    distance: distanceLabel,
    distanceKm: distanceKm,
    price: priceInfo.price,
    priceLabel: priceInfo.priceLabel,
    image: image,
    description: desc,
    liked: false,
    source: 'openagenda',
    kind: 'event',
    isPermanent: false
  };
}

function normalizeLangValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      var v = normalizeLangValue(value[i]);
      if (v) return v;
    }
    return '';
  }
  if (typeof value === 'object') {
    if (typeof value.fr === 'string') return value.fr;
    if (typeof value['@value'] === 'string') return value['@value'];
    if (typeof value.value === 'string') return value.value;
    if (typeof value.en === 'string') return value.en;
    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      var nested = normalizeLangValue(value[key]);
      if (nested) return nested;
    }
  }
  return '';
}

function recursiveFindFirst(obj, predicate) {
  var visited = [];

  function walk(value, keyName) {
    if (!value) return null;
    if (typeof value !== 'object') {
      return predicate(value, keyName) ? value : null;
    }
    if (visited.indexOf(value) !== -1) return null;
    visited.push(value);

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var arrResult = walk(value[i], keyName);
        if (arrResult !== null && arrResult !== undefined && arrResult !== '') return arrResult;
      }
      return null;
    }

    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      var result = walk(value[key], key);
      if (result !== null && result !== undefined && result !== '') return result;
    }

    return null;
  }

  return walk(obj, '');
}

function findFirstStringForKeys(obj, keyParts) {
  var lowerParts = keyParts.map(function(p) { return String(p).toLowerCase(); });
  var found = recursiveFindFirst(obj, function(value, keyName) {
    if (typeof value !== 'string') return false;
    var key = String(keyName || '').toLowerCase();
    if (!key) return false;
    return lowerParts.some(function(part) {
      return key.indexOf(part) !== -1;
    });
  });
  return typeof found === 'string' ? found.trim() : '';
}

function findFirstNumberForKeys(obj, keyParts) {
  var lowerParts = keyParts.map(function(p) { return String(p).toLowerCase(); });
  var found = recursiveFindFirst(obj, function(value, keyName) {
    var key = String(keyName || '').toLowerCase();
    if (!key) return false;
    var keyMatch = lowerParts.some(function(part) {
      return key.indexOf(part) !== -1;
    });
    if (!keyMatch) return false;
    if (typeof value === 'number') return true;
    if (typeof value === 'string' && value !== '' && !isNaN(Number(value))) return true;
    return false;
  });
  if (found === null || found === undefined || found === '') return null;
  var num = Number(found);
  return isNaN(num) ? null : num;
}

function findFirstImageUrl(obj) {
  var found = recursiveFindFirst(obj, function(value, keyName) {
    if (typeof value !== 'string') return false;
    var lower = value.toLowerCase();
    if (lower.indexOf('http') !== 0) return false;
    if (lower.match(/\.(jpg|jpeg|png|webp)(\?|$)/)) return true;
    var key = String(keyName || '').toLowerCase();
    return key.indexOf('image') !== -1 || key.indexOf('thumbnail') !== -1 || key.indexOf('photo') !== -1;
  });
  return typeof found === 'string' ? found : '';
}

function detectCityKeyFromDatatourisme(cityName) {
  var city = String(cityName || '').toLowerCase();
  if (!city) return 'paris';
  if (city.indexOf('bordeaux') !== -1) return 'bordeaux';
  if (city.indexOf('lille') !== -1) return 'lille';
  if (city.indexOf('nantes') !== -1) return 'nantes';
  if (city.indexOf('rennes') !== -1) return 'rennes';
  return 'paris';
}

function toDatatourismeCard(poi, indexOffset) {
  var title =
    normalizeLangValue(poi['dc:title']) ||
    normalizeLangValue(poi['rdfs:label']) ||
    normalizeLangValue(poi['schema:name']) ||
    normalizeLangValue(poi.name) ||
    findFirstStringForKeys(poi, ['title', 'label', 'name']);

  if (!title) return null;

  var desc =
    normalizeLangValue(poi['dc:description']) ||
    normalizeLangValue(poi['owl:comment']) ||
    normalizeLangValue(poi.description) ||
    findFirstStringForKeys(poi, ['description', 'comment']);

  var city =
    normalizeLangValue(poi['schema:addressLocality']) ||
    findFirstStringForKeys(poi, ['addresslocality', 'city', 'commune', 'locality']);

  var address =
    normalizeLangValue(poi['schema:streetAddress']) ||
    findFirstStringForKeys(poi, ['streetaddress', 'address']);

  var loc = address || city || 'Île-de-France';

  var lat = findFirstNumberForKeys(poi, ['latitude']);
  var lng = findFirstNumberForKeys(poi, ['longitude']);
  if (lat === null || lng === null) return null;

  var image = findFirstImageUrl(poi);
  if (!image) return null;
  
  var typeText = JSON.stringify(poi).toLowerCase();
  var keywords = [];
  if (typeText.indexOf('museum') !== -1 || typeText.indexOf('musée') !== -1 || typeText.indexOf('musee') !== -1) {
    keywords.push('musée');
  }
  if (typeText.indexOf('monument') !== -1 || typeText.indexOf('heritage') !== -1 || typeText.indexOf('patrimoine') !== -1) {
    keywords.push('patrimoine');
  }
  if (typeText.indexOf('gallery') !== -1 || typeText.indexOf('galerie') !== -1) {
    keywords.push('galerie');
  }
  if (!keywords.length) keywords = ['culture'];

  var cat = detectCategory(keywords, title, desc || '');
  var distanceKm = null;
  var distanceLabel = city || 'Île-de-France';
  if (USER_LOCATION) {
    distanceKm = getDistanceKm(USER_LOCATION.lat, USER_LOCATION.lng, lat, lng);
    distanceLabel = formatDistance(distanceKm);
  }

  var dtId = normalizeLangValue(poi['@id']) || normalizeLangValue(poi.id) || ('poi-' + indexOffset);
  var cityKey = detectCityKeyFromDatatourisme(city);

  return {
    id: 'dt:' + String(dtId),
    title: title,
    category: cat,
    tags: keywords.slice(0, 3),
    date: 'Lieu permanent',
    dateISO: null,
    location: loc + (city && loc.indexOf(city) === -1 ? ', ' + city : ''),
    lat: lat,
    lng: lng,
    city: city,
    cityKey: cityKey,
    distance: distanceLabel,
    distanceKm: distanceKm,
    price: 0,
    priceLabel: 'Voir détails',
    image: image,
    description: desc || 'Lieu culturel permanent',
    liked: false,
    source: 'datatourisme',
    kind: 'place',
    isPermanent: true
  };
}

function shouldLoadDatatourisme() {
  return SELECTED_CITIES.indexOf('paris') !== -1;
}

function loadDatatourismePlaces() {
  if (!shouldLoadDatatourisme()) return Promise.resolve([]);
  if (DATATOURISME_LOADED || DATATOURISME_LOADING) return Promise.resolve([]);
  if (typeof JSZip === 'undefined') {
    console.error('JSZip n\'est pas chargé');
    return Promise.resolve([]);
  }

  DATATOURISME_LOADING = true;

  return fetch(DATATOURISME_FLOW_URL)
    .then(function(res) { return res.arrayBuffer(); })
    .then(function(buffer) { return JSZip.loadAsync(buffer); })
    .then(function(zip) {
      var jsonFiles = [];

      zip.forEach(function(relativePath, file) {
        var lower = relativePath.toLowerCase();
        if (file.dir) return;
        if (lower.indexOf('.json') === -1) return;
        if (lower.indexOf('index') !== -1) return;
        if (lower.indexOf('context') !== -1) return;
        jsonFiles.push(file);
      });

      return Promise.all(jsonFiles.map(function(file) {
        return file.async('string').then(function(text) {
          try {
            return JSON.parse(text);
          } catch (e) {
            return null;
          }
        });
      }));
    })
    .then(function(items) {
      var cards = (items || [])
        .filter(Boolean)
        .map(function(item, i) {
          return toDatatourismeCard(item, i);
        })
        .filter(Boolean)
        .filter(function(card) {
          var id = String(card.id || '');
          if (!id) return false;
          if (LOADED_EVENT_IDS[id]) return false;
          if (isEventSeen(id)) return false;
          LOADED_EVENT_IDS[id] = true;
          return true;
        });

      DATATOURISME_LOADED = true;
      DATATOURISME_LOADING = false;
      return cards;
    })
    .catch(function(err) {
      console.error('loadDatatourismePlaces error:', err);
      DATATOURISME_LOADING = false;
      return [];
    });
}

function loadEvents() {
  if (EVENTS_LOADING || EVENTS_EXHAUSTED) return Promise.resolve();
  if (AGENDAS.length === 0) buildAgendaList();

  EVENTS_LOADING = true;

  var now = new Date();
  var activeAgendas = AGENDAS.filter(function(a) {
    return !a.done;
  });

  var openAgendaPromise;

  if (activeAgendas.length === 0) {
    openAgendaPromise = Promise.resolve([]);
  } else {
    var requests = activeAgendas.map(function(agenda) {
      var url = 'https://api.openagenda.com/v2/agendas/' + agenda.uid + '/events'
        + '?key=' + OPENAGENDA_KEY
        + '&size=20&lang=fr&timings[gte]=' + TODAY;

      if (agenda.cursor) {
        agenda.cursor.forEach(function(val) {
          url += '&after[]=' + encodeURIComponent(val);
        });
      }

      return fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.after && data.after.length > 0) agenda.cursor = data.after;
          else agenda.done = true;

          return (data.events || []).map(function(evt) {
            evt.__cityKey = agenda.cityKey;
            return evt;
          });
        })
        .catch(function() {
          agenda.done = true;
          return [];
        });
    });

    openAgendaPromise = Promise.all(requests).then(function(results) {
      var all = [];
      results.forEach(function(items) {
        all = all.concat(items);
      });
      return all;
    });
  }

  return Promise.all([openAgendaPromise, loadDatatourismePlaces()])
    .then(function(results) {
      var allOpenAgenda = results[0] || [];
      var datatourismeCards = results[1] || [];

      var newEvents = allOpenAgenda
        .filter(function(e) {
          var eventId = String(e.uid || '');
          if (!eventId) return false;
          if (LOADED_EVENT_IDS[eventId]) return false;
          if (isEventSeen(eventId)) return false;

          var timing = e.firstTiming || e.nextTiming || e.lastTiming;
          if (timing && timing.begin && new Date(timing.begin) < now) return false;

          LOADED_EVENT_IDS[eventId] = true;
          return true;
        })
        .map(function(e, i) {
          return toEventCard(e, EVENTS.length + i, e.__cityKey);
        })
        .concat(datatourismeCards);

      if (USER_LOCATION) {
        newEvents.sort(function(a, b) {
          var da = a.distanceKm !== null && a.distanceKm !== undefined ? a.distanceKm : 999999;
          var db = b.distanceKm !== null && b.distanceKm !== undefined ? b.distanceKm : 999999;
          return da - db;
        });
      } else {
        newEvents.sort(function(a, b) {
          if (a.isPermanent && !b.isPermanent) return 1;
          if (!a.isPermanent && b.isPermanent) return -1;
          if (!a.dateISO || !b.dateISO) return 0;
          return new Date(a.dateISO) - new Date(b.dateISO);
        });
      }

      EVENTS = EVENTS.concat(newEvents);

      if (activeAgendas.length === 0 || AGENDAS.every(function(a) { return a.done; })) {
        EVENTS_EXHAUSTED = true;
      }

      EVENTS_LOADING = false;
    })
    .catch(function(err) {
      console.error('loadEvents error:', err);
      EVENTS_LOADING = false;
    });
}

buildAgendaList();
