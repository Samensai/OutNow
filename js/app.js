// js/app.js — OutNow PWA

var savedLikesInit = [];
try {
  var rawLikes = localStorage.getItem('outnow_liked_events');
  if (rawLikes) savedLikesInit = JSON.parse(rawLikes);
} catch (e) {}

var state = {
  events: [],
  deck: [],
  disliked: [],
  currentFilter: { cat: 'all', distance: 999, budget: 999 },
  liked: savedLikesInit,
  currentDetail: null
};

var previousScreen = 'home';

var $ = function(id) { return document.getElementById(id); };
var cardStack = $('card-stack');
var likesGrid = $('likes-grid');
var detailContent = $('detail-content');
var filterPanel = $('filter-panel');
var panelOverlay = $('panel-overlay');

function saveLikedEvents() {
  try {
    localStorage.setItem('outnow_liked_events', JSON.stringify(state.liked));
  } catch (e) {}
}

function setActiveNav(screenName) {
  document.querySelectorAll('.nav-item').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.screen === screenName);
  });
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(function(screen) {
    screen.classList.remove('active');
  });

  var target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
}

function goBack() {
  if (previousScreen === 'group-detail') {
    showScreen('group-detail');
    return;
  }

  if (previousScreen === 'map') {
    showScreen('map');
    setTimeout(function() {
      if (typeof mapInstance !== 'undefined' && mapInstance) {
        mapInstance.invalidateSize();
      }
    }, 100);
    return;
  }

  if (previousScreen === 'likes') {
    showScreen('likes');
    setActiveNav('likes');
    renderLikes();
    previousScreen = 'home';
    return;
  }

  if (previousScreen === 'friends') {
    showScreen('friends');
    setActiveNav('friends');
    previousScreen = 'home';
    return;
  }

  if (previousScreen === 'groups') {
    showScreen('groups');
    setActiveNav('groups');
    previousScreen = 'home';
    return;
  }

  showScreen('home');
  setActiveNav('home');
  previousScreen = 'home';
}

function eventAlreadyLiked(eventId) {
  return !!state.liked.find(function(item) {
    return item.id === eventId;
  });
}

function eventAlreadyDisliked(eventId) {
  return state.disliked.indexOf(eventId) !== -1;
}

function buildDeck() {
  var cat = state.currentFilter.cat;
  var budget = state.currentFilter.budget;
  var maxDist = state.currentFilter.distance;
  var deckIds = state.deck.map(function(e) { return e.id; });

  var newEvents = EVENTS.filter(function(e) {
    var notLiked = !eventAlreadyLiked(e.id);
    var notDisliked = !eventAlreadyDisliked(e.id);
    var notInDeck = deckIds.indexOf(e.id) === -1;
    var notSeen = typeof isEventSeen === 'function' ? !isEventSeen(e.id) : true;
    var matchCat = cat === 'all' || e.category === cat;
    var matchBudget = e.price <= budget;

    var matchDist = true;
    if (
      typeof USER_LOCATION !== 'undefined' &&
      USER_LOCATION &&
      e.distanceKm !== null &&
      e.distanceKm !== undefined &&
      maxDist < 999
    ) {
      matchDist = e.distanceKm <= maxDist;
    }

    return notLiked && notDisliked && notInDeck && notSeen && matchCat && matchBudget && matchDist;
  });

  if (typeof USER_LOCATION !== 'undefined' && USER_LOCATION) {
    newEvents.sort(function(a, b) {
      var da = a.distanceKm !== null && a.distanceKm !== undefined ? a.distanceKm : 999999;
      var db = b.distanceKm !== null && b.distanceKm !== undefined ? b.distanceKm : 999999;
      return da - db;
    });
  }

  newEvents.forEach(function(e) {
    state.deck.push(e);
  });
}

function renderCards() {
  if (!cardStack) return;

  cardStack.innerHTML = '';

  if (state.deck.length === 0) {
    if (typeof EVENTS_LOADING !== 'undefined' && !EVENTS_LOADING && !EVENTS_EXHAUSTED) {
      cardStack.innerHTML = '<div class="card-empty"><div class="empty-emoji">⏳</div><h3>Chargement...</h3></div>';
      loadEvents().then(function() {
        buildDeck();
        renderCards();
      });
      return;
    }

    cardStack.innerHTML =
      '<div class="card-empty">' +
        '<div class="empty-emoji">😴</div>' +
        '<h3>Plus de sorties !</h3>' +
        '<p style="color:var(--text3);font-size:14px;margin-top:8px">Change tes filtres ou reviens plus tard.</p>' +
      '</div>';
    return;
  }

  state.deck.slice(0, 3).forEach(function(ev, i) {
    if (typeof markEventSeen === 'function') {
      markEventSeen(ev.id);
    }

    var card = createCard(ev, i);
    cardStack.appendChild(card);

    if (i === 0) {
      setupSwipe(card, ev);
    }
  });

  positionCards();

  if (state.deck.length < 5 && !EVENTS_LOADING && !EVENTS_EXHAUSTED) {
    loadEvents().then(function() {
      buildDeck();
    });
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
        ev.tags.map(function(tag, tagIndex) {
          return '<span class="card-tag' + (tagIndex === 0 ? ' accent' : '') + '">' + tag + '</span>';
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
    if (Math.abs(div._dragX || 0) < 5) {
      previousScreen = 'home';
      openDetail(ev);
    }
  });

  return div;
}

function positionCards() {
  var cards = cardStack.querySelectorAll('.event-card');
  cards.forEach(function(card, index) {
    card.classList.remove('front', 'behind', 'third');
    if (index === 0) card.classList.add('front');
    else if (index === 1) card.classList.add('behind');
    else card.classList.add('third');
  });
}

function setupSwipe(card, ev) {
  var startX = 0;
  var startY = 0;
  var currentX = 0;
  var isDragging = false;

  var likeLabel = card.querySelector('.swipe-label.like');
  var nopeLabel = card.querySelector('.swipe-label.nope');

  function onStart(e) {
    isDragging = true;
    var pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX;
    startY = pt.clientY;
    card.style.transition = 'none';
  }

  function onMove(e) {
    if (!isDragging) return;

    e.preventDefault();
    var pt = e.touches ? e.touches[0] : e;
    currentX = pt.clientX - startX;
    var currentY = pt.clientY - startY;

    card.style.transform =
      'translate(' + currentX + 'px,' + (currentY * 0.3) + 'px) rotate(' + (currentX * 0.08) + 'deg)';
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
    if (currentX > threshold) {
      swipeCard('like', card, ev);
    } else if (currentX < -threshold) {
      swipeCard('dislike', card, ev);
    } else {
      card.style.transform = '';
      likeLabel.style.opacity = 0;
      nopeLabel.style.opacity = 0;
      card._dragX = 0;
    }
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

  if (typeof markEventSeen === 'function') {
    markEventSeen(ev.id);
  }

  if (direction === 'like') {
    if (!eventAlreadyLiked(ev.id)) {
      state.liked.push(ev);
      saveLikedEvents();
    }
  } else {
    if (!eventAlreadyDisliked(ev.id)) {
      state.disliked.push(ev.id);
    }
  }

  state.deck = state.deck.filter(function(item) {
    return item.id !== ev.id;
  });

  if (state.deck.length < 5 && !EVENTS_LOADING && !EVENTS_EXHAUSTED) {
    loadEvents().then(function() {
      buildDeck();
    });
  }

  setTimeout(function() {
    card.remove();
    renderCards();
  }, 400);
}

if ($('btn-like')) {
  $('btn-like').addEventListener('click', function() {
    var top = cardStack.querySelector('.front');
    if (!top || state.deck.length === 0) return;
    swipeCard('like', top, state.deck[0]);
  });
}

if ($('btn-dislike')) {
  $('btn-dislike').addEventListener('click', function() {
    var top = cardStack.querySelector('.front');
    if (!top || state.deck.length === 0) return;
    swipeCard('dislike', top, state.deck[0]);
  });
}

if ($('btn-super')) {
  $('btn-super').style.display = 'none';
  $('btn-super').addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
  });
}

document.querySelectorAll('.cat-pill').forEach(function(pill) {
  pill.addEventListener('click', function() {
    document.querySelectorAll('.cat-pill').forEach(function(item) {
      item.classList.remove('active');
    });

    pill.classList.add('active');
    state.currentFilter.cat = pill.dataset.cat;
    state.deck = [];
    buildDeck();
    renderCards();
  });
});

if ($('btn-filter')) {
  $('btn-filter').addEventListener('click', function() {
    if (filterPanel) filterPanel.classList.remove('hidden');
    if (panelOverlay) panelOverlay.classList.remove('hidden');
  });
}

if (panelOverlay) {
  panelOverlay.addEventListener('click', closeFilter);
}

if ($('btn-apply-filter')) {
  $('btn-apply-filter').addEventListener('click', function() {
    closeFilter();
    state.deck = [];
    buildDeck();
    renderCards();
  });
}

function closeFilter() {
  if (filterPanel) filterPanel.classList.add('hidden');
  if (panelOverlay) panelOverlay.classList.add('hidden');
}

if ($('filter-distance')) {
  $('filter-distance').addEventListener('input', function() {
    var val = parseInt(this.value, 10);
    $('filter-distance-val').textContent = val >= 50 ? 'Tous' : val + ' km';
    state.currentFilter.distance = val >= 50 ? 999 : val;
  });
}

document.querySelectorAll('.budget-pill').forEach(function(pill) {
  pill.addEventListener('click', function() {
    pill.closest('.budget-pills').querySelectorAll('.budget-pill').forEach(function(item) {
      item.classList.remove('active');
    });

    pill.classList.add('active');
    if (pill.dataset.val !== undefined) {
      state.currentFilter.budget = parseInt(pill.dataset.val, 10);
    }
  });
});

function openDetail(ev) {
  state.currentDetail = ev;

  if (typeof markEventSeen === 'function') {
    markEventSeen(ev.id);
  }

  var isLiked = eventAlreadyLiked(ev.id);

  detailContent.innerHTML =
    '<img class="detail-hero" src="' + ev.image + '" alt="' + ev.title + '" />' +
    '<div class="detail-body">' +
      '<div class="detail-tags">' +
        ev.tags.map(function(tag) {
          return '<span class="detail-tag">' + tag + '</span>';
        }).join('') +
      '</div>' +
      '<div class="detail-title">' + ev.title + '</div>' +
      '<div class="detail-meta-row">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        ev.date +
      '</div>' +
      '<div class="detail-meta-row">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        ev.location + (ev.distance !== 'Paris' ? ' · ' + ev.distance : '') +
      '</div>' +
      '<div class="detail-desc">' + ev.description + '</div>' +
      '<div class="detail-price-badge">' + ev.priceLabel + '</div>' +
      '<div class="detail-cta">' +
        '<button class="btn-primary" onclick="likeFromDetail(' + ev.id + ')">' +
          (isLiked ? '❤️ Sauvegardé' : '🤍 Sauvegarder') +
        '</button>' +
      '</div>' +
    '</div>';

  showScreen('detail');
}

window.likeFromDetail = function(id) {
  var ev = EVENTS.find(function(item) { return item.id === id; }) ||
           state.liked.find(function(item) { return item.id === id; });

  if (!ev) return;

  if (typeof markEventSeen === 'function') {
    markEventSeen(ev.id);
  }

  if (!eventAlreadyLiked(id)) {
    state.liked.push(ev);
    saveLikedEvents();
  }

  state.deck = state.deck.filter(function(item) {
    return item.id !== id;
  });

  openDetail(ev);
};

function renderLikes() {
  if (!likesGrid) return;

  var savedLikes = state.liked;
  if (savedLikes.length === 0) {
    likesGrid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text2)">' +
        '<div style="font-size:48px;margin-bottom:16px">❤️</div>' +
        '<div style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:8px">Pas encore de likes</div>' +
      '</div>';
    return;
  }

  var now = new Date();

  likesGrid.innerHTML = savedLikes.map(function(ev) {
    var isPast = ev.dateISO && new Date(ev.dateISO) < now;

    return '' +
      '<div class="like-item" onclick="openLikeDetail(' + ev.id + ')">' +
        '<img src="' + ev.image + '" alt="' + ev.title + '" loading="lazy" />' +
        (isPast ? '<div class="like-past-badge">Passé</div>' : '') +
        '<div class="like-item-info">' +
          '<div class="like-item-title">' + ev.title + '</div>' +
          '<div class="like-item-date">' + ev.date + '</div>' +
        '</div>' +
      '</div>';
  }).join('');
}

window.openLikeDetail = function(id) {
  var ev = EVENTS.find(function(item) { return item.id === id; }) ||
           state.liked.find(function(item) { return item.id === id; });

  if (!ev) return;

  previousScreen = 'likes';
  openDetail(ev);
};
