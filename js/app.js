// js/app.js — OutNow PWA

var state = {
  events: [],
  deck: [],
  disliked: [],
  currentFilter: { cat: 'all', distance: 999, budget: 999 },
  liked: [],
  currentDetail: null,
};

var previousScreen = 'home';

var $ = function(id) { return document.getElementById(id); };
var cardStack = $('card-stack');
var likesGrid = $('likes-grid');
var detailContent = $('detail-content');
var filterPanel = $('filter-panel');
var panelOverlay = $('panel-overlay');

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  var target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
}

function goBack() {
  if (previousScreen === 'group-detail') {
    showScreen('group-detail');
  } else if (previousScreen === 'map') {
    showScreen('map');
    setTimeout(function() { if (mapInstance) mapInstance.invalidateSize(); }, 100);
  } else {
    showScreen('home');
  }
  previousScreen = 'home';
}

function buildDeck() {
  var cat = state.currentFilter.cat;
  var budget = state.currentFilter.budget;
  var maxDist = state.currentFilter.distance;
  var deckIds = state.deck.map(function(e) { return e.id; });

  var newEvents = EVENTS.filter(function(e) {
    var notLiked = !state.liked.find(function(l) { return l.id === e.id; });
    var notDisliked = state.disliked.indexOf(e.id) === -1;
    var notInDeck = deckIds.indexOf(e.id) === -1;
    var matchCat = cat === 'all' || e.category === cat;
    var matchBudget = e.price <= budget;
    // Filtre distance réel si géoloc disponible et coordonnées connues
    var matchDist = true;
    if (USER_LOCATION && e.distanceKm !== null && e.distanceKm !== undefined && maxDist < 999) {
      matchDist = e.distanceKm <= maxDist;
    }
    return notLiked && notDisliked && notInDeck && matchCat && matchBudget && matchDist;
  });

  // Trie par distance si géoloc dispo
  if (USER_LOCATION) {
    newEvents.sort(function(a, b) {
      var da = a.distanceKm !== null ? a.distanceKm : 999;
      var db = b.distanceKm !== null ? b.distanceKm : 999;
      return da - db;
    });
  }

  newEvents.forEach(function(e) { state.deck.push(e); });
}

function renderCards() {
  cardStack.innerHTML = '';
  if (state.deck.length === 0) {
    if (!EVENTS_LOADING && !EVENTS_EXHAUSTED) {
      cardStack.innerHTML = '<div class="card-empty"><div class="empty-emoji">⏳</div><h3>Chargement...</h3></div>';
      loadEvents().then(function() { buildDeck(); renderCards(); });
      return;
    }
    cardStack.innerHTML = '<div class="card-empty"><div class="empty-emoji">😴</div><h3>Plus de sorties !</h3><p style="color:var(--text3);font-size:14px;margin-top:8px">Change tes filtres ou reviens plus tard.</p></div>';
    return;
  }
  state.deck.slice(0, 3).forEach(function(ev, i) {
    var card = createCard(ev, i);
    cardStack.appendChild(card);
    if (i === 0) setupSwipe(card, ev);
  });
  positionCards();
  if (state.deck.length < 5 && !EVENTS_LOADING && !EVENTS_EXHAUSTED) {
    loadEvents().then(function() { buildDeck(); });
  }
}

function createCard(ev, idx) {
  var div = document.createElement('div');
  div.className = 'event-card';
  div.dataset.id = ev.id;
  div.innerHTML =
    '<img class="card-img" src="' + ev.image + '" alt="' + ev.title + '" loading="lazy" />' +
    '<div class="card-gradient"></div>' +
    '<div class="swipe-label like">LIKE</div>' +
    '<div class="swipe-label nope">NOPE</div>' +
    '<div class="card-content">' +
      '<div class="card-tags">' +
        ev.tags.map(function(t, ti) {
          return '<span class="card-tag' + (ti === 0 ? ' accent' : '') + '">' + t + '</span>';
        }).join('') +
      '</div>' +
      '<div class="card-title">' + ev.title + '</div>' +
      '<div class="card-meta">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        ev.date +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        ev.distance +
      '</div>' +
    '</div>';
  div.addEventListener('click', function() {
    if (Math.abs(div._dragX || 0) < 5) { previousScreen = 'home'; openDetail(ev); }
  });
  return div;
}

function positionCards() {
  var cards = cardStack.querySelectorAll('.event-card');
  cards.forEach(function(c, i) {
    c.classList.remove('front', 'behind', 'third');
    if (i === 0) c.classList.add('front');
    else if (i === 1) c.classList.add('behind');
    else c.classList.add('third');
  });
}

function setupSwipe(card, ev) {
  var startX = 0, startY = 0, currentX = 0, isDragging = false;
  var likeLabel = card.querySelector('.swipe-label.like');
  var nopeLabel = card.querySelector('.swipe-label.nope');

  function onStart(e) {
    isDragging = true;
    var pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY;
    card.style.transition = 'none';
  }
  function onMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    var pt = e.touches ? e.touches[0] : e;
    currentX = pt.clientX - startX;
    var currentY = pt.clientY - startY;
    card.style.transform = 'translate(' + currentX + 'px,' + (currentY * 0.3) + 'px) rotate(' + (currentX * 0.08) + 'deg)';
    card._dragX = currentX;
    var ratio = Math.abs(currentX) / (window.innerWidth * 0.35);
    likeLabel.style.opacity = currentX > 0 ? Math.min(ratio, 1) : 0;
    nopeLabel.style.opacity = currentX < 0 ? Math.min(ratio, 1) : 0;
  }
  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    card.style.transition = 'transform 0.3s ease';
    var threshold = window.innerWidth * 0.35;
    if (currentX > threshold) swipeCard('like', card, ev);
    else if (currentX < -threshold) swipeCard('dislike', card, ev);
    else { card.style.transform = ''; likeLabel.style.opacity = 0; nopeLabel.style.opacity = 0; card._dragX = 0; }
  }
  card.addEventListener('mousedown', onStart);
  card.addEventListener('mousemove', onMove);
  card.addEventListener('mouseup', onEnd);
  card.addEventListener('touchstart', onStart, { passive: true });
  card.addEventListener('touchmove', onMove, { passive: false });
  card.addEventListener('touchend', onEnd);
}

function swipeCard(direction, card, ev) {
  var x = direction === 'like' ? window.innerWidth * 1.5 : -window.innerWidth * 1.5;
  card.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
  card.style.transform = 'translate(' + x + 'px,0) rotate(' + (direction === 'like' ? 30 : -30) + 'deg)';
  card.style.opacity = '0';
  if (direction === 'like') {
    state.liked.push(ev);
    try { localStorage.setItem('outnow_liked_events', JSON.stringify(state.liked)); } catch(e) {}
  } else {
    state.disliked.push(ev.id);
  }
  state.deck = state.deck.filter(function(e) { return e.id !== ev.id; });
  if (state.deck.length < 5 && !EVENTS_LOADING && !EVENTS_EXHAUSTED) {
    loadEvents().then(function() { buildDeck(); });
  }
  setTimeout(function() { card.remove(); renderCards(); }, 400);
}

$('btn-like') && $('btn-like').addEventListener('click', function() {
  var top = cardStack.querySelector('.front');
  if (!top || state.deck.length === 0) return;
  swipeCard('like', top, state.deck[0]);
});
$('btn-dislike') && $('btn-dislike').addEventListener('click', function() {
  var top = cardStack.querySelector('.front');
  if (!top || state.deck.length === 0) return;
  swipeCard('dislike', top, state.deck[0]);
});
$('btn-super') && $('btn-super').addEventListener('click', function() {
  var top = cardStack.querySelector('.front');
  if (!top || state.deck.length === 0) return;
  var ev = state.deck[0];
  top.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
  top.style.transform = 'translateY(-150%) scale(1.1)';
  top.style.opacity = '0';
  state.liked.push(Object.assign({}, ev, { super: true }));
  state.deck = state.deck.filter(function(e) { return e.id !== ev.id; });
  setTimeout(function() { top.remove(); renderCards(); }, 400);
});

document.querySelectorAll('.cat-pill').forEach(function(pill) {
  pill.addEventListener('click', function() {
    document.querySelectorAll('.cat-pill').forEach(function(p) { p.classList.remove('active'); });
    pill.classList.add('active');
    state.currentFilter.cat = pill.dataset.cat;
    state.deck = [];
    buildDeck();
    renderCards();
  });
});

$('btn-filter') && $('btn-filter').addEventListener('click', function() {
  filterPanel.classList.remove('hidden');
  panelOverlay.classList.remove('hidden');
});
panelOverlay && panelOverlay.addEventListener('click', closeFilter);
$('btn-apply-filter') && $('btn-apply-filter').addEventListener('click', function() {
  closeFilter();
  state.deck = [];
  buildDeck();
  renderCards();
});
function closeFilter() {
  filterPanel.classList.add('hidden');
  panelOverlay.classList.add('hidden');
}

$('filter-distance') && $('filter-distance').addEventListener('input', function() {
  var val = parseInt(this.value);
  $('filter-distance-val').textContent = val >= 50 ? 'Tous' : val + ' km';
  state.currentFilter.distance = val >= 50 ? 999 : val;
});

document.querySelectorAll('.budget-pill').forEach(function(p) {
  p.addEventListener('click', function() {
    p.closest('.budget-pills').querySelectorAll('.budget-pill').forEach(function(x) { x.classList.remove('active'); });
    p.classList.add('active');
    if (p.dataset.val !== undefined) state.currentFilter.budget = parseInt(p.dataset.val);
  });
});

function openDetail(ev) {
  state.currentDetail = ev;
  var isLiked = state.liked.find(function(l) { return l.id === ev.id; });
  detailContent.innerHTML =
    '<img class="detail-hero" src="' + ev.image + '" alt="' + ev.title + '" />' +
    '<div class="detail-body">' +
      '<div class="detail-tags">' + ev.tags.map(function(t) { return '<span class="detail-tag">' + t + '</span>'; }).join('') + '</div>' +
      '<div class="detail-title">' + ev.title + '</div>' +
      '<div class="detail-meta-row"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + ev.date + '</div>' +
      '<div class="detail-meta-row"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + ev.location + (ev.distance !== 'Paris' ? ' · ' + ev.distance : '') + '</div>' +
      '<div class="detail-desc">' + ev.description + '</div>' +
      '<div class="detail-price-badge">' + ev.priceLabel + '</div>' +
      '<div class="detail-cta"><button class="btn-primary" onclick="likeFromDetail(' + ev.id + ')">' + (isLiked ? '❤️ Sauvegarde' : '🤍 Sauvegarder') + '</button></div>' +
    '</div>';
  showScreen('detail');
}

window.likeFromDetail = function(id) {
  var ev = EVENTS.find(function(e) { return e.id === id; });
  if (!ev || state.liked.find(function(l) { return l.id === id; })) return;
  state.liked.push(ev);
  state.deck = state.deck.filter(function(e) { return e.id !== id; });
  try { localStorage.setItem('outnow_liked_events', JSON.stringify(state.liked)); } catch(e) {}
  openDetail(ev);
};

function renderLikes() {
  if (!likesGrid) return;
  var savedLikes = state.liked;
  if (savedLikes.length === 0) {
    likesGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text2)"><div style="font-size:48px;margin-bottom:16px">❤️</div><div style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:8px">Pas encore de likes</div></div>';
    return;
  }
  var now = new Date();
  likesGrid.innerHTML = savedLikes.map(function(ev) {
    var isPast = ev.dateISO && new Date(ev.dateISO) < now;
    return '<div class="like-item" onclick="openLikeDetail(' + ev.id + ')">' +
      '<img src="' + ev.image + '" alt="' + ev.title + '" loading="lazy" />' +
      (isPast ? '<div class="like-past-badge">Passe</div>' : '') +
      '<div class="like-item-info"><div class="like-item-title">' + ev.title + '</div><div class="like-item-date">' + ev.date + '</div></div>' +
    '</div>';
  }).join('');
}

window.openLikeDetail = function(id) {
  var ev = EVENTS.find(function(e) { return e.id === id; }) ||
           state.liked.find(function(e) { return e.id === id; });
  if (ev) { previousScreen = 'likes'; openDetail(ev); }
};
