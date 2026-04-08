var EVENTS = [];
var EVENTS_LOADING = false;
var EVENTS_EXHAUSTED = false;
var SEEN_IDS = {};

var OPENAGENDA_KEY = "6cf33cc591df40a9b0fac2a946d4c3ec";
var TODAY = new Date().toISOString().split('T')[0];
 
var AGENDAS = [
  { uid: 61665301, cursor: null, done: false },
  { uid: 52870970, cursor: null, done: false },
  { uid: 85121895, cursor: null, done: false },
  { uid: 14898606, cursor: null, done: false },
  { uid: 20272888, cursor: null, done: false },
  { uid: 39308038, cursor: null, done: false }
];
 
function loadEvents() {
  if (EVENTS_LOADING || EVENTS_EXHAUSTED) return Promise.resolve();
  EVENTS_LOADING = true;
 
  var activeAgendas = AGENDAS.filter(function(a) { return !a.done; });
  if (activeAgendas.length === 0) {
    EVENTS_EXHAUSTED = true;
    EVENTS_LOADING = false;
    return Promise.resolve();
  }
 
  var now = new Date();
 
  var promises = activeAgendas.map(function(agenda) {
    var url = "https://api.openagenda.com/v2/agendas/" + agenda.uid + "/events"
      + "?key=" + OPENAGENDA_KEY
      + "&size=20"
      + "&lang=fr"
      + "&timings[gte]=" + TODAY;
 
    if (agenda.cursor) {
      agenda.cursor.forEach(function(val) {
        url += "&after[]=" + encodeURIComponent(val);
      });
    }
 
    return fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.after && data.after.length > 0) {
          agenda.cursor = data.after;
        } else {
          agenda.done = true;
        }
        return data.events || [];
      })
      .catch(function() {
        agenda.done = true;
        return [];
      });
  });
 
  return Promise.all(promises).then(function(results) {
    var all = [];
    results.forEach(function(evts) { all = all.concat(evts); });
 
    var newEvents = all
      .filter(function(e) {
        // Déduplique
        if (SEEN_IDS[e.uid]) return false;
        // Filtre les events dont la date de début est passée
        var timing = e.firstTiming || e.nextTiming || e.lastTiming;
        if (timing && timing.begin) {
          if (new Date(timing.begin) < now) return false;
        }
        SEEN_IDS[e.uid] = true;
        return true;
      })
      .map(function(e, i) {
        var title = (e.title && (e.title.fr || e.title.en)) || "Evenement";
        var desc = (e.description && (e.description.fr || e.description.en)) || "";
        var loc = (e.location && (e.location.name || e.location.city)) || "Paris";
        var city = (e.location && e.location.city) || "";
 
        var image = fallbackImage(Object.keys(SEEN_IDS).length + i);
        if (e.image && e.image.base && e.image.filename) {
          image = e.image.base + e.image.filename;
        }
 
        var price = 0;
        var priceLabel = "Gratuit";
        if (e.registration && e.registration.length > 0) {
          price = 10;
          priceLabel = "Payant";
        }
 
        var dateStr = "Prochainement";
        var timing = e.firstTiming || e.nextTiming || e.lastTiming;
        if (timing && timing.begin) {
          var d = new Date(timing.begin);
          dateStr = d.toLocaleDateString("fr-FR", {
            weekday: "long", day: "numeric", month: "long",
            hour: "2-digit", minute: "2-digit"
          });
        }
 
        // Stocke la date de fin pour détecter les events passés dans les likes
        var endDate = null;
        if (timing && timing.end) {
          endDate = timing.end;
        }
 
        var keywords = [];
        if (e.keywords && e.keywords.fr) {
          keywords = Array.isArray(e.keywords.fr) ? e.keywords.fr : [e.keywords.fr];
        }
        var cat = detectCategory(keywords, title);
        var tags = keywords.slice(0, 3);
        if (tags.length === 0) tags = [cat];
 
        return {
          id: e.uid || (Date.now() + i),
          title: title,
          category: cat,
          tags: tags,
          date: dateStr,
          endDate: endDate,
          location: loc + (city && loc.indexOf(city) === -1 ? ", " + city : ""),
          distance: "Paris",
          price: price,
          priceLabel: priceLabel,
          image: image,
          description: desc,
          liked: false
        };
      });
 
    EVENTS = EVENTS.concat(newEvents);
 
    var allDone = AGENDAS.every(function(a) { return a.done; });
    if (allDone) EVENTS_EXHAUSTED = true;
 
    EVENTS_LOADING = false;
    console.log("OutNow: " + EVENTS.length + " evenements charges.");
  });
}
 
function detectCategory(keywords, title) {
  var text = (keywords.join(" ") + " " + title).toLowerCase();
  if (text.match(/concert|musique|live|festival|dj|jazz|rock|electro|classique/)) return "concert";
  if (text.match(/expo|exposition|art|musee|galerie|photo|peinture/)) return "expo";
  if (text.match(/sport|foot|basket|tennis|volley|course|yoga|danse/)) return "sport";
  if (text.match(/food|gastronomie|marche|cuisine|restaurant|degustation/)) return "food";
  return "soiree";
}
 
function fallbackImage(i) {
  var imgs = [
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80",
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80",
    "https://images.unsplash.com/photo-1580136579312-94651dfd596d?w=600&q=80",
    "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=600&q=80",
    "https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=600&q=80",
    "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&q=80",
    "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=600&q=80",
    "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=600&q=80"
  ];
  return imgs[i % imgs.length];
}
