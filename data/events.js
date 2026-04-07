var EVENTS = [];
var EVENTS_PAGE = 0;
var EVENTS_LOADING = false;
var EVENTS_EXHAUSTED = false;

var OPENAGENDA_KEY = "6cf33cc591df40a9b0fac2a946d4c3ec";
var AGENDA_UIDS = [61665301, 52870970];
var SEEN_IDS = {};

function loadEvents() {
  if (EVENTS_LOADING || EVENTS_EXHAUSTED) return Promise.resolve();
  EVENTS_LOADING = true;

  var after = EVENTS_PAGE * 20;

  var promises = AGENDA_UIDS.map(function(uid) {
    var url = "https://api.openagenda.com/v2/agendas/" + uid + "/events"
      + "?key=" + OPENAGENDA_KEY
      + "&size=20"
      + "&from=" + after
      + "&lang=fr"
      + "&relative[]=current"
      + "&relative[]=upcoming";
    return fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) { return data.events || []; })
      .catch(function() { return []; });
  });

  return Promise.all(promises).then(function(results) {
    var all = [];
    results.forEach(function(evts) { all = all.concat(evts); });

    var newEvents = all.filter(function(e) {
      if (SEEN_IDS[e.uid]) return false;
      SEEN_IDS[e.uid] = true;
      return true;
    }).map(function(e, i) {
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
        location: loc + (city && loc !== city ? ", " + city : ""),
        distance: "Paris",
        price: price,
        priceLabel: priceLabel,
        image: image,
        description: desc,
        liked: false
      };
    });

    if (newEvents.length === 0) {
      EVENTS_EXHAUSTED = true;
    } else {
      EVENTS = EVENTS.concat(newEvents);
      EVENTS_PAGE++;
    }

    EVENTS_LOADING = false;
    console.log("OutNow: " + EVENTS.length + " evenements charges au total.");
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
