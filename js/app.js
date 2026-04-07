// js/app.js — OutNow PWA

// ── STATE ──
const state = {
  events: JSON.parse(JSON.stringify(EVENTS)),
  deck: [],
  currentFilter: { cat: 'all', distance: 15, budget: 999, when: 'today' },
  liked: [],
  currentDetail: null,
  group: null,
  groupDeck: [],
  groupLikes: {},
  obSlide: 0,
};

// ── DOM REFS ──
const $ = id => document.getElementById(id);
const splash = $('splash');
const app = $('app');
const cardStack = $('card-stack');
const groupCardStack = $('group-card-stack');
const likesGrid = $('likes-grid');
const detailContent = $('detail-content');
const filterPanel = $('filter-panel');
const panelOverlay = $('panel-overlay');

// ── INIT ──
window.addEventListener('load', function() {
  setTimeout(function() {
    splash.style.display = 'none';
    app.classList.remove('hidden');
    var onboarded = localStorage.getItem('outnow_onboarded');
    loadEvents().then(function() {
      state.events = JSON.parse(JSON.stringify(EVENTS));
      if (onboarded) {
        showScreen('home');
        buildDeck();
        renderCards();
      } else {
        showScreen('onboarding');
      }
    });
  }, 2000);
});

// ── SCREEN ROUTING ──
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.screen === name);
  });
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const s = btn.dataset.screen;
    showScreen(s);
    if (s === 'likes') renderLikes();
    if (s === 'home') renderCards();
  });
});

// ── ONBOARDING ──
let obSlide = 0;
const obSlides = document.querySelectorAll('.ob-slide');
const obDots = document.querySelectorAll('.dot');

function goToObSlide(n) {
  obSlides.forEach(s => s.classList.remove('active'));
  obDots.forEach(d => d.classList.remove('active'));
  obSlides[n].classList.add('active');
  obDots[n].classList.add('active');
  obSlide = n;
  $('btn-next-ob').textContent = n === obSlides.length - 1 ? 'Commencer !' : 'Continuer';
}

$('btn-next-ob').addEventListener('click', () => {
  if (obSlide < obSlides.length - 1) {
    goToObSlide(obSlide + 1);
  } else {
    finishOnboarding();
  }
});
$('btn-skip-ob').addEventListener('click', finishOnboarding);

function finishOnboarding() {
  localStorage.setItem('outnow_onboarded', '1');
  showScreen('home');
  buildDeck();
  renderCards();
}

// ── DECK BUILDER ──
function buildDeck() {
  const { cat, budget } = state.currentFilter;
  state.deck = state.events
    .filter(e => (cat === 'all' || e.category === cat) && e.price <= budget)
    .filter(e => !state.liked.find(l => l.id === e.id));
  for (let i = state.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
  }
}

// ── CARD RENDERER ──
function renderCards() {
  cardStack.innerHTML = '';
  if (state.deck.length === 0) {
    cardStack.innerHTML = '<div class="card-empty"><div class="empty-emoji">😴</div><h3>Plus de sorties ici !</h3><p style="color:var(--text3);font-size:14px;margin-top:8px">Change tes filtres ou reviens plus tard.</p></div>';
    return;
  }
  state.deck.slice(0, 3).forEach((ev, i) => {
    const card = createCard(ev, i);
    cardStack.appendChild(card);
    if (i === 0) setupSwipe(card, ev);
  });
  positionCards();
}

function createCard(ev, idx) {
  const div = document.createElement('div');
  div.className = 'event-card';
  div.dataset.id = ev.id;
  div.innerHTML =
    '<img class="card-img" src="' + ev.image + '" alt="' + ev.title + '" loading="lazy" />' +
    '<div class="card-gradient"></div>' +
    '<div class="swipe-label like">LIKE</div>' +
    '<div class="swipe-label nope">NOPE</div>' +
    '<div class="card-content">' +
      '<div class="card-tags">' +
        ev.tags.map(function(t, ti) { return '<span class="card-tag' + (ti === 0 ? ' accent' : '') + '">' + t + '</span>'; }).join('') +
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
    if (Math.abs(div._dragX || 0) < 5) openDetail(ev);
  });
  return div;
}

function positionCards() {
  const cards = cardStack.querySelectorAll('.event-card');
  cards.forEach((c, i) => {
    c.classList.remove('front', 'behind', 'third');
    if (i === 0) c.classList.add('front');
    else if (i === 1) c.classList.add('behind');
    else c.classList.add('third');
  });
}

// ── SWIPE LOGIC ──
function setupSwipe(card, ev) {
  let startX = 0, startY = 0, currentX = 0, isDragging = false;
  const likeLabel = card.querySelector('.swipe-label.like');
  const nopeLabel = card.querySelector('.swipe-label.nope');

  function onStart(e) {
    isDragging = true;
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX;
    startY = pt.clientY;
    card.style.transition = 'none';
  }
  function onMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    currentX = pt.clientX - startX;
    const currentY = pt.clientY - startY;
    card.style.transform = 'translate(' + currentX + 'px, ' + (currentY * 0.3) + 'px) rotate(' + (currentX * 0.08) + 'deg)';
    card._dragX = currentX;
    const ratio = Math.abs(currentX) / (window.innerWidth * 0.35);
    likeLabel.style.opacity = currentX > 0 ? Math.min(ratio, 1) : 0;
    nopeLabel.style.opacity = currentX < 0 ? Math.min(ratio, 1) : 0;
  }
  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    card.style.transition = 'transform 0.3s ease';
    const threshold = window.innerWidth * 0.35;
    if (currentX > threshold) swipeCard('like', card, ev);
    else if (currentX < -threshold) swipeCard('dislike', card, ev);
    else {
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
  card.style.transform = 'translate(' + x + 'px, 0) rotate(' + (direction === 'like' ? 30 : -30) + 'deg)';
  card.style.opacity = '0';
  if (direction === 'like') {
    state.liked.push(ev);
    localStorage.setItem('outnow_likes', JSON.stringify(state.liked.map(function(e) { return e.id; })));
  }
  state.deck = state.deck.filter(function(e) { return e.id !== ev.id; });

  // Recharge si moins de 5 cartes restantes
  if (state.deck.length < 5 && !EVENTS_LOADING && !EVENTS_EXHAUSTED) {
    loadEvents().then(function() {
      state.events = JSON.parse(JSON.stringify(EVENTS));
      buildDeck();
    });
  }

  setTimeout(function() { card.remove(); renderCards(); }, 400);
}
// ── ACTION BUTTONS ──
$('btn-like').addEventListener('click', () => {
  const top = cardStack.querySelector('.front');
  if (!top) return;
  swipeCard('like', top, state.deck[0]);
});
$('btn-dislike').addEventListener('click', () => {
  const top = cardStack.querySelector('.front');
  if (!top) return;
  swipeCard('dislike', top, state.deck[0]);
});
$('btn-super').addEventListener('click', () => {
  const top = cardStack.querySelector('.front');
  if (!top) return;
  const ev = state.deck[0];
  top.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
  top.style.transform = 'translateY(-150%) scale(1.1)';
  top.style.opacity = '0';
  state.liked.push(Object.assign({}, ev, { super: true }));
  state.deck = state.deck.filter(e => e.id !== ev.id);
  setTimeout(() => { top.remove(); renderCards(); }, 400);
});

// ── CATEGORY FILTER ──
document.querySelectorAll('.cat-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.currentFilter.cat = pill.dataset.cat;
    buildDeck();
    renderCards();
  });
});

// ── FILTER PANEL ──
$('btn-filter').addEventListener('click', () => {
  filterPanel.classList.remove('hidden');
  panelOverlay.classList.remove('hidden');
});
panelOverlay.addEventListener('click', closeFilter);
$('btn-apply-filter').addEventListener('click', () => {
  closeFilter();
  buildDeck();
  renderCards();
});
function closeFilter() {
  filterPanel.classList.add('hidden');
  panelOverlay.classList.add('hidden');
}
$('filter-distance').addEventListener('input', function() {
  $('filter-distance-val').textContent = this.value + ' km';
  state.currentFilter.distance = parseInt(this.value);
});
document.querySelectorAll('.budget-pill').forEach(p => {
  p.addEventListener('click', () => {
    p.closest('.budget-pills').querySelectorAll('.budget-pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    if (p.dataset.val !== undefined) state.currentFilter.budget = parseInt(p.dataset.val);
    if (p.dataset.when !== undefined) state.currentFilter.when = p.dataset.when;
  });
});

// ── DETAIL VIEW ──
function openDetail(ev) {
  state.currentDetail = ev;
  const isLiked = state.liked.find(l => l.id === ev.id);
  detailContent.innerHTML =
    '<img class="detail-hero" src="' + ev.image + '" alt="' + ev.title + '" />' +
    '<div class="detail-body">' +
      '<div class="detail-tags">' +
        ev.tags.map(function(t) { return '<span class="detail-tag">' + t + '</span>'; }).join('') +
      '</div>' +
      '<div class="detail-title">' + ev.title + '</div>' +
      '<div class="detail-meta-row">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        ev.date +
      '</div>' +
      '<div class="detail-meta-row">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        ev.location + ' · ' + ev.distance +
      '</div>' +
      '<div class="detail-desc">' + ev.description + '</div>' +
      '<div class="detail-price-badge">' + ev.priceLabel + '</div>' +
      '<div class="detail-cta">' +
        '<button class="btn-primary" onclick="reserveEvent(' + ev.id + ')">Reserver ma place</button>' +
        '<button class="btn-icon" onclick="likeFromDetail(' + ev.id + ')">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="' + (isLiked ? 'var(--accent)' : 'none') + '" stroke="var(--accent)" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  showScreen('detail');
}

window.reserveEvent = function(id) {
  alert('Reservation simulee ! En prod, ca redirigerait vers Eventbrite / Billetweb.');
};
window.likeFromDetail = function(id) {
  const ev = state.events.find(e => e.id === id);
  if (!ev) return;
  if (!state.liked.find(l => l.id === id)) {
    state.liked.push(ev);
    state.deck = state.deck.filter(e => e.id !== id);
  }
  openDetail(ev);
};

$('btn-back-detail').addEventListener('click', () => showScreen('home'));
$('btn-share-detail').addEventListener('click', () => {
  if (navigator.share && state.currentDetail) {
    navigator.share({ title: state.currentDetail.title, text: state.currentDetail.description, url: window.location.href });
  }
});

// ── LIKES SCREEN ──
function renderLikes() {
  if (state.liked.length === 0) {
    likesGrid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text2)">' +
        '<div style="font-size:48px;margin-bottom:16px">❤️</div>' +
        '<div style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:8px">Pas encore de likes</div>' +
        '<div style="font-size:14px">Swipe dans Decouvrir pour sauvegarder des sorties !</div>' +
      '</div>';
    return;
  }
  likesGrid.innerHTML = state.liked.map(function(ev) {
    return '<div class="like-item" onclick="openLikeDetail(' + ev.id + ')">' +
      '<img src="' + ev.image + '" alt="' + ev.title + '" loading="lazy" />' +
      '<div class="like-item-info">' +
        '<div class="like-item-title">' + ev.title + '</div>' +
        '<div class="like-item-date">' + ev.date + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

window.openLikeDetail = function(id) {
  const ev = state.events.find(e => e.id === id);
  if (ev) openDetail(ev);
};

// ── GROUP MODE ──
$('btn-group-mode').addEventListener('click', () => {
  showScreen('group');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.screen === 'group');
  });
});
$('btn-back-group').addEventListener('click', () => showScreen('home'));

$('btn-create-group').addEventListener('click', () => {
  const name = $('group-name-input').value.trim() || 'Mon Groupe';
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  state.group = { name: name, code: code, members: ['Toi', 'Emma', 'Lucas'] };
  state.groupDeck = JSON.parse(JSON.stringify(state.events));
  state.groupLikes = {};
  $('group-session-name').textContent = name;
  $('group-code-display').textContent = code;
  renderGroupMembers();
  renderGroupCard();
  $('group-create').classList.add('hidden');
  $('group-session').classList.remove('hidden');
});

$('btn-join-group').addEventListener('click', () => {
  const code = prompt('Entre le code du groupe :');
  if (code) alert('Rejoindre le groupe "' + code.toUpperCase() + '" — fonctionnalite multi-joueur a connecter a un backend !');
});

$('btn-copy-code').addEventListener('click', () => {
  if (state.group && navigator.clipboard) {
    navigator.clipboard.writeText(state.group.code).then(() => {
      $('btn-copy-code').textContent = 'Copie !';
      setTimeout(() => { $('btn-copy-code').textContent = 'Copier'; }, 1500);
    });
  }
});

function renderGroupMembers() {
  const list = $('group-members-list');
  const emojis = ['👤', '👩', '👨'];
  list.innerHTML = state.group.members.map(function(m, i) {
    return '<div class="member-avatar">' +
      '<div class="member-bubble' + (i === 0 ? ' you' : '') + '">' + (emojis[i] || '👥') + '</div>' +
      '<div class="member-name">' + m + '</div>' +
    '</div>';
  }).join('');
}

function renderGroupCard() {
  groupCardStack.innerHTML = '';
  if (state.groupDeck.length === 0) {
    groupCardStack.innerHTML = '<div class="card-empty"><div class="empty-emoji">✅</div><h3>Tout swipe !</h3></div>';
    return;
  }
  state.groupDeck.slice(0, 2).forEach((ev, i) => {
    const card = createCard(ev, i);
    groupCardStack.appendChild(card);
    if (i === 0) setupGroupSwipe(card, ev);
  });
  positionGroupCards();
}

function positionGroupCards() {
  const cards = groupCardStack.querySelectorAll('.event-card');
  cards.forEach((c, i) => {
    c.classList.remove('front', 'behind', 'third');
    if (i === 0) c.classList.add('front');
    else c.classList.add('behind');
  });
}

function setupGroupSwipe(card, ev) {
  let startX = 0, currentX = 0, isDragging = false;
  const likeLabel = card.querySelector('.swipe-label.like');
  const nopeLabel = card.querySelector('.swipe-label.nope');

  card.addEventListener('touchstart', function(e) {
    isDragging = true;
    startX = e.touches[0].clientX;
    card.style.transition = 'none';
  }, { passive: true });
  card.addEventListener('touchmove', function(e) {
    if (!isDragging) return;
    currentX = e.touches[0].clientX - startX;
    card.style.transform = 'translate(' + currentX + 'px, 0) rotate(' + (currentX * 0.08) + 'deg)';
    const r = Math.abs(currentX) / (window.innerWidth * 0.35);
    likeLabel.style.opacity = currentX > 0 ? Math.min(r, 1) : 0;
    nopeLabel.style.opacity = currentX < 0 ? Math.min(r, 1) : 0;
  }, { passive: false });
  card.addEventListener('touchend', function() {
    isDragging = false;
    card.style.transition = 'transform 0.3s ease';
    const threshold = window.innerWidth * 0.35;
    if (currentX > threshold) groupSwipe('like', card, ev);
    else if (currentX < -threshold) groupSwipe('dislike', card, ev);
    else {
      card.style.transform = '';
      likeLabel.style.opacity = 0;
      nopeLabel.style.opacity = 0;
    }
  });
  card.addEventListener('mousedown', function(e) {
    isDragging = true; startX = e.clientX; card.style.transition = 'none';
  });
  card.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    currentX = e.clientX - startX;
    card.style.transform = 'translate(' + currentX + 'px, 0) rotate(' + (currentX * 0.08) + 'deg)';
    const r = Math.abs(currentX) / (window.innerWidth * 0.35);
    likeLabel.style.opacity = currentX > 0 ? Math.min(r, 1) : 0;
    nopeLabel.style.opacity = currentX < 0 ? Math.min(r, 1) : 0;
  });
  card.addEventListener('mouseup', function() {
    isDragging = false;
    card.style.transition = 'transform 0.3s ease';
    const threshold = window.innerWidth * 0.35;
    if (currentX > threshold) groupSwipe('like', card, ev);
    else if (currentX < -threshold) groupSwipe('dislike', card, ev);
    else { card.style.transform = ''; likeLabel.style.opacity = 0; nopeLabel.style.opacity = 0; }
  });
}

function groupSwipe(direction, card, ev) {
  const x = direction === 'like' ? window.innerWidth * 1.5 : -window.innerWidth * 1.5;
  card.style.transform = 'translate(' + x + 'px, 0) rotate(' + (direction === 'like' ? 30 : -30) + 'deg)';
  card.style.opacity = '0';
  if (direction === 'like') {
    const membersLiked = Math.random() > 0.4;
    if (membersLiked) {
      setTimeout(() => showMatchModal(ev), 600);
      addGroupMatch(ev);
    }
  }
  state.groupDeck = state.groupDeck.filter(e => e.id !== ev.id);
  setTimeout(() => { card.remove(); renderGroupCard(); }, 400);
}

$('grp-btn-like').addEventListener('click', () => {
  const top = groupCardStack.querySelector('.front');
  if (!top) return;
  groupSwipe('like', top, state.groupDeck[0]);
});
$('grp-btn-dislike').addEventListener('click', () => {
  const top = groupCardStack.querySelector('.front');
  if (!top) return;
  groupSwipe('dislike', top, state.groupDeck[0]);
});

function showMatchModal(ev) {
  $('match-event-name').textContent = ev.title;
  $('match-modal').classList.remove('hidden');
}
$('btn-match-ok').addEventListener('click', () => {
  $('match-modal').classList.add('hidden');
});

function addGroupMatch(ev) {
  const list = $('matches-list');
  const item = document.createElement('div');
  item.className = 'match-card';
  item.innerHTML =
    '<img class="match-card-img" src="' + ev.image + '" alt="' + ev.title + '" />' +
    '<div class="match-card-info">' +
      '<div class="match-card-title">' + ev.title + '</div>' +
      '<div class="match-card-sub">' + ev.date + ' · ' + ev.distance + '</div>' +
    '</div>' +
    '<div class="match-badge">Match !</div>';
  list.prepend(item);
  $('matches-section').style.display = 'block';
}
