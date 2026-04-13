var EVENTS = [];
var EVENTS_LOADING = false;
var EVENTS_EXHAUSTED = false;
var USER_LOCATION = null;

var OPENAGENDA_KEY = "6cf33cc591df40a9b0fac2a946d4c3ec";
var TODAY = new Date().toISOString().split('T')[0];

var CITIES = {
  paris:    { label: 'Paris',    agendas: [61665301, 52870970, 85121895, 14898606, 20272888, 39308038, 95716291] }
  // bordeaux: { label: 'Bordeaux', agendas: [1108324, 83392987] },
  // lille:    { label: 'Lille',    agendas: [57621068] },
  // nantes:   { label: 'Nantes',   agendas: [82470621] },
  // rennes:   { label: 'Rennes',   agendas: [20500020] }
};

var SELECTED_CITIES = ['paris'];
var AGENDAS = [];
var LOADED_EVENT_IDS = {};
var SEEN_IDS = {};

// ── Wikidata lieux culturels permanents ──
var WIKIDATA_LOADED = false;
var WIKIDATA_LOADING = false;

// Requête SPARQL : musées, galeries, monuments à Paris avec image, coordonnées et article Wikipedia FR
var WIKIDATA_SPARQL = '\
SELECT DISTINCT ?item ?name ?desc ?image ?lat ?lng ?type ?article ?website ?hours WHERE {\
  ?item wdt:P131* wd:Q90 .\
  ?item wdt:P625 ?coords .\
  ?item wdt:P18 ?image .\
  ?item rdfs:label ?name . FILTER(LANG(?name) = "fr")\
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "fr") }\
  OPTIONAL { ?article schema:about ?item ; schema:inLanguage "fr" ; schema:isPartOf <https://fr.wikipedia.org/> . }\
  OPTIONAL { ?item wdt:P856 ?website . }\
  OPTIONAL { ?item wdt:P6886 ?hours . }\
  { ?item wdt:P31/wdt:P279* wd:Q33506 . BIND("musee" AS ?type) }\
  UNION\
  { ?item wdt:P31/wdt:P279* wd:Q207694 . BIND("musee" AS ?type) }\
  UNION\
  { ?item wdt:P31/wdt:P279* wd:Q1007870 . BIND("galerie" AS ?type) }\
  UNION\
  { ?item wdt:P31/wdt:P279* wd:Q23413 . BIND("monument" AS ?type) }\
  UNION\
  { ?item wdt:P31/wdt:P279* wd:Q839954 . BIND("monument" AS ?type) }\
  UNION\
  { ?item wdt:P31/wdt:P279* wd:Q22698 . BIND("parc" AS ?type) }\
  UNION\
  { ?item wdt:P31/wdt:P279* wd:Q1107656 . BIND("parc" AS ?type) }\
  UNION\
  { ?item wdt:P31/wdt:P279* wd:Q24354 . BIND("spectacle" AS ?type) }\
  ?item wdt:P625 ?coordsVal .\
  BIND(geof:latitude(?coordsVal) AS ?lat)\
  BIND(geof:longitude(?coordsVal) AS ?lng)\
  FILTER(?lat > 48.8 && ?lat < 48.92 && ?lng > 2.25 && ?lng < 2.42)\
} LIMIT 150';

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
  WIKIDATA_LOADED = false;
  WIKIDATA_LOADING = false;
  buildAgendaList();
}

function requestUserLocation() {
  return new Promise(function(resolve) {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        USER_LOCATION = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        resolve(USER_LOCATION);
      },
      function() { resolve(null); },
      { timeout: 8000, maximumAge: 300000, enableHighAccuracy: true }
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
  if (text.match(/parc|jardin|garden|park|nature|verdure/)) return 'parc';
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

// Convertit une URL d'image Wikimedia Commons en URL directe redimensionnée
function wikimediaThumb(url, width) {
  if (!url) return '';
  // L'URL brute de Wikidata ressemble à :
  // http://commons.wikimedia.org/wiki/Special:FilePath/Louvre_Museum_Wikimedia_Commons.jpg
  // On la transforme en URL de thumbnail via l'API Wikimedia
  var filename = decodeURIComponent(url.split('/').pop()).replace(/ /g, '_');
  var w = width || 600;
  return 'https://commons.wikimedia.org/wiki/Special:FilePath/' +
    encodeURIComponent(filename) + '?width=' + w;
}

// Extrait le titre Wikipedia FR depuis l'URL de l'article
function wikipediaTitleFromUrl(articleUrl) {
  if (!articleUrl) return null;
  var parts = articleUrl.split('/wiki/');
  if (parts.length < 2) return null;
  return decodeURIComponent(parts[1]);
}

// Appelle l'API REST Wikipedia pour récupérer le résumé d'un article
function fetchWikipediaSummary(title) {
  var url = 'https://fr.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title);
  return fetch(url, { headers: { 'Accept': 'application/json' } })
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) {
      // extract retourne le texte brut du résumé (sans balises HTML)
      return data && data.extract ? data.extract : null;
    })
    .catch(function() { return null; });
}

function toWikidataCard(row, index) {
  var name = row.name && row.name.value ? row.name.value : null;
  if (!name) return null;

  var lat = row.lat && row.lat.value ? parseFloat(row.lat.value) : null;
  var lng = row.lng && row.lng.value ? parseFloat(row.lng.value) : null;
  if (!lat || !lng) return null;

  var rawImage = row.image && row.image.value ? row.image.value : null;
  if (!rawImage) return null;

  var image = wikimediaThumb(rawImage, 600);
  var desc = row.desc && row.desc.value ? row.desc.value : 'Lieu culturel parisien';
  var type = row.type && row.type.value ? row.type.value : 'musee';
  var itemId = row.item && row.item.value ? row.item.value.split('/').pop() : ('wd-' + index);
  var articleUrl = row.article && row.article.value ? row.article.value : null;
  var website = row.website && row.website.value ? row.website.value : null;
  var hours = row.hours && row.hours.value ? row.hours.value : null;

  var id = 'wd:' + itemId;
  if (LOADED_EVENT_IDS[id]) return null;
  if (isEventSeen(id)) return null;
  LOADED_EVENT_IDS[id] = true;

  // Mots-clés et catégorie selon le type
  var typeKeywords = {
    'musee':    'musée',
    'galerie':  'galerie',
    'monument': 'monument',
    'parc':     'parc',
    'spectacle':'spectacle'
  };
  var keywords = [typeKeywords[type] || 'culture'];
  var cat = detectCategory(keywords, name, desc);

  // Prix non renseigné — on n'affiche rien
  var price = 0;
  var priceLabel = null;

  var distanceKm = null;
  var distanceLabel = 'Paris';
  if (USER_LOCATION) {
    distanceKm = getDistanceKm(USER_LOCATION.lat, USER_LOCATION.lng, lat, lng);
    distanceLabel = formatDistance(distanceKm);
  }

  return {
    id: id,
    title: name,
    category: cat,
    tags: keywords.slice(0, 3),
    date: 'Lieu permanent',
    dateISO: null,
    location: 'Paris',
    lat: lat,
    lng: lng,
    city: 'Paris',
    cityKey: 'paris',
    distance: distanceLabel,
    distanceKm: distanceKm,
    price: price,
    priceLabel: priceLabel,
    website: website,
    hours: hours,
    image: image,
    description: desc,
    wikipediaTitle: wikipediaTitleFromUrl(articleUrl),
    liked: false,
    source: 'wikidata',
    kind: 'place',
    isPermanent: true
  };
}

function loadWikidataPlaces() {
  if (WIKIDATA_LOADED || WIKIDATA_LOADING) return Promise.resolve([]);
  WIKIDATA_LOADING = true;

  var url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(WIKIDATA_SPARQL);

  return fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var rows = (data.results && data.results.bindings) ? data.results.bindings : [];
      var cards = rows
        .map(function(row, i) { return toWikidataCard(row, i); })
        .filter(Boolean);

      // Enrichissement Wikipedia : on lance les appels en parallèle (max 8 simultanés)
      // pour ne pas surcharger l'API et respecter un délai raisonnable
      function enrichBatch(cards, batchSize) {
        var batches = [];
        for (var i = 0; i < cards.length; i += batchSize) {
          batches.push(cards.slice(i, i + batchSize));
        }
        return batches.reduce(function(chain, batch) {
          return chain.then(function() {
            return Promise.all(batch.map(function(card) {
              if (!card.wikipediaTitle) return Promise.resolve();
              return fetchWikipediaSummary(card.wikipediaTitle).then(function(extract) {
                if (extract) {
                  // On tronque à 500 caractères pour garder quelque chose de lisible
                  card.description = extract.length > 500
                    ? extract.slice(0, 497) + '…'
                    : extract;
                }
              });
            }));
          });
        }, Promise.resolve());
      }

      return enrichBatch(cards, 8).then(function() {
        WIKIDATA_LOADED = true;
        WIKIDATA_LOADING = false;
        console.log('WIKIDATA cards =', cards.length);
        return cards;
      });
    })
    .catch(function(err) {
      console.error('loadWikidataPlaces error:', err);
      WIKIDATA_LOADING = false;
      return [];
    });
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
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
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
  var distanceLabel = city || 'Paris';
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

function loadEvents() {
  if (EVENTS_LOADING || EVENTS_EXHAUSTED) return Promise.resolve();
  if (AGENDAS.length === 0) buildAgendaList();

  EVENTS_LOADING = true;

  var now = new Date();
  var activeAgendas = AGENDAS.filter(function(a) { return !a.done; });

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
        .catch(function() { agenda.done = true; return []; });
    });

    openAgendaPromise = Promise.all(requests).then(function(results) {
      var all = [];
      results.forEach(function(items) { all = all.concat(items); });
      return all;
    });
  }

  return Promise.all([openAgendaPromise, loadWikidataPlaces()])
    .then(function(results) {
      var allOpenAgenda = results[0] || [];
      var wikidataCards = results[1] || [];

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
        .concat(wikidataCards);

      // Mélange : on intercale les lieux permanents entre les événements datés
      // pour éviter d'avoir tous les temporaires d'un côté et tous les permanents de l'autre
      var temporaires = newEvents.filter(function(e) { return !e.isPermanent; });
      var permanents  = newEvents.filter(function(e) { return e.isPermanent; });

      // Tri interne : les temporaires par date, les permanents aléatoirement
      if (USER_LOCATION) {
        temporaires.sort(function(a, b) {
          var da = a.distanceKm != null ? a.distanceKm : 999999;
          var db = b.distanceKm != null ? b.distanceKm : 999999;
          return da - db;
        });
        permanents.sort(function(a, b) {
          var da = a.distanceKm != null ? a.distanceKm : 999999;
          var db = b.distanceKm != null ? b.distanceKm : 999999;
          return da - db;
        });
      } else {
        temporaires.sort(function(a, b) {
          if (!a.dateISO || !b.dateISO) return 0;
          return new Date(a.dateISO) - new Date(b.dateISO);
        });
        // Mélange aléatoire des permanents
        for (var pi = permanents.length - 1; pi > 0; pi--) {
          var pj = Math.floor(Math.random() * (pi + 1));
          var tmp = permanents[pi]; permanents[pi] = permanents[pj]; permanents[pj] = tmp;
        }
      }

      // Intercalage : 1 permanent toutes les ~3 cartes temporaires
      newEvents = [];
      var ti = 0, pi2 = 0;
      while (ti < temporaires.length || pi2 < permanents.length) {
        // 2 temporaires
        for (var k = 0; k < 2 && ti < temporaires.length; k++, ti++) {
          newEvents.push(temporaires[ti]);
        }
        // 1 permanent
        if (pi2 < permanents.length) {
          newEvents.push(permanents[pi2++]);
        }
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
