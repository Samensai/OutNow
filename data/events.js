var EVENTS = [];

var OPENAGENDA_KEY = "6cf33cc591df40a9b0fac2a946d4c3ec";
var VILLE = "Paris";

function loadEvents() {
  var url = "https://api.openagenda.com/v2/events"
    + "?key=" + OPENAGENDA_KEY
    + "&city=" + encodeURIComponent(VILLE)
    + "&size=20"
    + "&lang=fr"
    + "&relative[]=current"
    + "&relative[]=upcoming";

  return fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.events || data.events.length === 0) {
        console.warn("Aucun evenement recu depuis OpenAgenda.");
        return;
      }
      EVENTS = data.events.map(function(e, i) {
        var title = (e.title && (e.title.fr || e.title.en)) || "Evenement";
        var desc = (e.description && (e.description.fr || e.description.en)) || "";
        var loc = (e.location && (e.location.name || e.location.city)) || VILLE;
        var image = (e.image && e.image.base && e.image.filename)
          ? (e.image.base + e.image.filename)
          : fallbackImage(i);
        var price = 0;
        var priceLabel = "Gratuit";
        if (e.registration && e.registration.length > 0) {
          price = 10;
          priceLabel = "Payant";
        }
        var dateStr = "Prochainement";
        if (e.timings && e.timings[0] && e.timings[0].begin) {
          var d = new Date(e.timings[0].begin);
          dateStr = d.toLocaleDateString("fr-FR", {
            weekday: "long", day: "numeric", month: "long",
            hour: "2-digit", minute: "2-digit"
          });
        }
        var keywords = Array.isArray(e.keywords) ? e.keywords : [];
        var cat = detectCategory(keywords, title);
        var tags = keywords.slice(0, 3);
        if (tags.length === 0) tags = [cat];

        return {
          id: e.uid || i,
          title: title,
          category: cat,
          tags: tags,
          date: dateStr,
          location: loc,
          distance: "...",
          price: price,
          priceLabel: priceLabel,
          image: image,
          description: desc,
          liked: false
        };
      });
    })
    .catch(function(err) {
      console.error("Erreur OpenAgenda:", err);
    });
}

function detectCategory(keywords, title) {
  var text = (keywords.join(" ") + " " + title).toLowerCase();
  if (text.match(/concert|musique|live|festival|dj/)) return "concert";
  if (text.match(/expo|exposition|art|musee|galerie/)) return "expo";
  if (text.match(/sport|foot|basket|tennis|volley|course/)) return "sport";
  if (text.match(/food|gastronomie|marche|cuisine|restaurant/)) return "food";
  return "soiree";
}

function fallbackImage(i) {
  var imgs = [
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80",
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80",
    "https://images.unsplash.com/photo-1580136579312-94651dfd596d?w=600&q=80",
    "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=600&q=80",
    "https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=600&q=80",
    "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&q=80"
  ];
  return imgs[i % imgs.length];
}
