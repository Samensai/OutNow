let EVENTS = [];

async function loadEvents() {
  const CLE_API = 'TA_CLE_ICI';
  const VILLE = 'Paris'; // ou Lyon, Bordeaux...

  const res = await fetch(
    `https://api.openagenda.com/v2/events?key=${6cf33cc591df40a9b0fac2a946d4c3ec}&city=${VILLE}&size=20&lang=fr`
  );
  const data = await res.json();

  EVENTS = data.events.map(e => ({
    id: e.uid,
    title: e.title.fr || e.title.en || 'Événement',
    category: mapCategory(e.keywords),
    tags: (e.keywords || []).slice(0, 3),
    date: formatDate(e.timings?.[0]?.begin),
    location: e.location?.name || e.location?.city || VILLE,
    distance: '—',
    price: e.registration?.length > 0 ? 10 : 0,
    priceLabel: e.registration?.length > 0 ? 'Payant' : 'Gratuit',
    image: e.image?.base + e.image?.filename || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600',
    description: e.description?.fr || '',
    liked: false,
  }));
}

function mapCategory(keywords = []) {
  const k = keywords.join(' ').toLowerCase();
  if (k.includes('concert') || k.includes('musique')) return 'concert';
  if (k.includes('expo') || k.includes('art')) return 'expo';
  if (k.includes('sport')) return 'sport';
  if (k.includes('food') || k.includes('gastronomie')) return 'food';
  return 'soiree';
}

function formatDate(iso) {
  if (!iso) return 'Prochainement';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

loadEvents();
