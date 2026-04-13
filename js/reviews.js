// js/reviews.js — Système de notation, "fait", grades OutNow

// ── GRADES ──
var GRADES = [
  { min: 0,   label: 'Curieux',      emoji: '🌱' },
  { min: 1,   label: 'Explorateur',  emoji: '🗺️' },
  { min: 5,   label: 'Habitué',      emoji: '⭐' },
  { min: 10,  label: 'Connaisseur',  emoji: '🎭' },
  { min: 20,  label: 'Expert',       emoji: '🏆' },
  { min: 50,  label: 'Légende',      emoji: '👑' },
  { min: 100, label: 'Critique',     emoji: '🎬' }
];
var GRADE_MILESTONES = [1, 5, 10, 20, 50, 100];

function getGrade(score) {
  var g = GRADES[0];
  for (var i = 0; i < GRADES.length; i++) {
    if (score >= GRADES[i].min) g = GRADES[i];
  }
  return g;
}

// ── DONE EVENTS (localStorage + Supabase) ──
var DONE_IDS = {};
try {
  DONE_IDS = JSON.parse(localStorage.getItem('outnow_done_events') || '{}');
} catch(e) { DONE_IDS = {}; }

function saveDoneIds() {
  try { localStorage.setItem('outnow_done_events', JSON.stringify(DONE_IDS)); } catch(e) {}
}

function isEventDone(eventId) {
  return !!DONE_IDS[String(eventId)];
}

function markEventDone(eventId) {
  if (!currentUser) return Promise.resolve();
  var id = String(eventId);
  DONE_IDS[id] = true;
  saveDoneIds();
  return sb.from('user_done_events')
    .upsert({ user_id: currentUser.id, event_id: id })
    .then(function() {})
    .catch(function(err) { console.error('markEventDone:', err); });
}

function loadDoneEvents() {
  if (!currentUser) return Promise.resolve();
  return sb.from('user_done_events')
    .select('event_id')
    .eq('user_id', currentUser.id)
    .then(function(res) {
      (res.data || []).forEach(function(r) { DONE_IDS[r.event_id] = true; });
      saveDoneIds();
    });
}

// ── NOTATION ──
function submitReview(eventId, rating, comment, visibility) {
  if (!currentUser) return Promise.reject(new Error('Non connecté'));
  return sb.from('reviews')
    .upsert({
      user_id:    currentUser.id,
      event_id:   String(eventId),
      rating:     rating,
      comment:    comment || null,
      visibility: visibility
    })
    .then(function(res) {
      if (res.error) throw res.error;
      // Mettre à jour le score utilisateur
      return incrementUserScore();
    });
}

function incrementUserScore() {
  if (!currentUser) return Promise.resolve();
  // On recalcule le score exact depuis la table reviews
  return sb.from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .then(function(res) {
      var score = res.count || 0;
      return sb.from('profiles')
        .update({ score: score })
        .eq('id', currentUser.id)
        .then(function() {
          if (currentProfile) currentProfile.score = score;
        });
    });
}

function loadReviewsForEvent(eventId) {
  if (!currentUser) return Promise.resolve([]);
  var eid = String(eventId);
  // On récupère les avis "everyone" + les avis "friends" de nos amis
  return sb.from('reviews')
    .select('*, profiles(username, score)')
    .eq('event_id', eid)
    .eq('visibility', 'everyone')
    .order('created_at', { ascending: false })
    .limit(20)
    .then(function(res) {
      var publicReviews = res.data || [];
      // Avis friends de l'utilisateur connecté
      return sb.from('reviews')
        .select('*, profiles(username, score)')
        .eq('event_id', eid)
        .eq('visibility', 'friends')
        .eq('user_id', currentUser.id)
        .then(function(res2) {
          var myReview = res2.data || [];
          // Fusionner sans doublons
          var merged = publicReviews.slice();
          myReview.forEach(function(r) {
            if (!merged.find(function(x) { return x.id === r.id; })) merged.push(r);
          });
          return merged;
        });
    })
    .catch(function() { return []; });
}

function getUserReviewForEvent(eventId) {
  if (!currentUser) return Promise.resolve(null);
  return sb.from('reviews')
    .select('*')
    .eq('event_id', String(eventId))
    .eq('user_id', currentUser.id)
    .single()
    .then(function(res) { return res.data || null; })
    .catch(function() { return null; });
}

// ── RENDU ÉTOILES ──
function renderStarsDisplay(rating) {
  var html = '<span class="stars-display">';
  for (var i = 1; i <= 5; i++) {
    if (rating >= i) {
      html += '<span class="star full">★</span>';
    } else if (rating >= i - 0.5) {
      html += '<span class="star half">★</span>';
    } else {
      html += '<span class="star empty">★</span>';
    }
  }
  html += '</span>';
  return html;
}

// ── MODAL NOTATION ──
var _reviewRating = 0;
var _reviewEventId = null;

window.openReviewModal = function(eventId) {
  _reviewEventId = String(eventId);
  _reviewRating = 0;

  // Vérifier si l'utilisateur a déjà un avis
  getUserReviewForEvent(eventId).then(function(existing) {
    if (existing) {
      _reviewRating = existing.rating;
      document.getElementById('review-comment').value = existing.comment || '';
      var vis = existing.visibility === 'everyone' ? 'review-vis-everyone' : 'review-vis-friends';
      document.getElementById('review-vis-friends').checked = false;
      document.getElementById('review-vis-everyone').checked = false;
      document.getElementById(vis).checked = true;
    } else {
      document.getElementById('review-comment').value = '';
      document.getElementById('review-vis-friends').checked = true;
      document.getElementById('review-vis-everyone').checked = false;
    }
    renderReviewStarPicker(_reviewRating);
    document.getElementById('review-modal').classList.remove('hidden');
  });
};

window.closeReviewModal = function() {
  document.getElementById('review-modal').classList.add('hidden');
};

function renderReviewStarPicker(currentRating) {
  var container = document.getElementById('review-star-picker');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 1; i <= 5; i++) {
    (function(starIndex) {
      // Wrapper pour les deux moitiés d'une étoile
      var wrapper = document.createElement('span');
      wrapper.className = 'star-pick-wrapper';
      wrapper.style.cssText = 'position:relative;display:inline-block;font-size:36px;cursor:pointer;line-height:1';

      // Moitié gauche (demi-étoile)
      var left = document.createElement('span');
      left.dataset.value = starIndex - 0.5;
      left.style.cssText = 'position:absolute;left:0;top:0;width:50%;height:100%;overflow:hidden;color:' +
        (currentRating >= starIndex - 0.5 ? '#f59e0b' : 'var(--bg3)');
      left.innerHTML = '★';

      // Étoile entière (fond)
      var right = document.createElement('span');
      right.dataset.value = starIndex;
      right.style.cssText = 'color:' + (currentRating >= starIndex ? '#f59e0b' : 'var(--bg3)');
      right.innerHTML = '★';

      wrapper.appendChild(left);
      wrapper.appendChild(right);

      function applyRating(val) {
        _reviewRating = val;
        renderReviewStarPicker(_reviewRating);
      }

      function applyHover(val) {
        container.querySelectorAll('[data-value]').forEach(function(el) {
          el.style.color = parseFloat(el.dataset.value) <= val ? '#f59e0b' : 'var(--bg3)';
        });
      }

      left.addEventListener('click',     function() { applyRating(starIndex - 0.5); });
      right.addEventListener('click',    function() { applyRating(starIndex); });
      left.addEventListener('mouseover', function() { applyHover(starIndex - 0.5); });
      right.addEventListener('mouseover',function() { applyHover(starIndex); });
      wrapper.addEventListener('mouseout',function() { renderReviewStarPicker(_reviewRating); });

      container.appendChild(wrapper);
    })(i);
  }
}

function renderReviewStarPickerHover(hoverVal) {
  document.querySelectorAll('#review-star-picker [data-value]').forEach(function(el) {
    el.style.color = parseFloat(el.dataset.value) <= hoverVal ? '#f59e0b' : 'var(--bg3)';
  });
}

window.submitReviewForm = function() {
  if (!_reviewEventId) return;
  if (_reviewRating === 0) {
    alert('Choisis une note !');
    return;
  }
  var comment = (document.getElementById('review-comment').value || '').trim();
  var visibility = document.getElementById('review-vis-everyone').checked ? 'everyone' : 'friends';
  var btn = document.getElementById('btn-submit-review');
  btn.textContent = 'Publication…';
  btn.disabled = true;

  submitReview(_reviewEventId, _reviewRating, comment, visibility)
    .then(function() {
      closeReviewModal();
      // Rafraîchir la fiche détail si elle est ouverte sur le même event
      if (state.currentDetail && String(state.currentDetail.id) === _reviewEventId) {
        openDetail(state.currentDetail);
      }
    })
    .catch(function(err) {
      alert('Erreur : ' + (err.message || err));
    })
    .finally(function() {
      btn.textContent = 'Publier';
      btn.disabled = false;
    });
};

// ── SECTION AVIS dans openDetail ──
function renderReviewSection(eventId) {
  var section = document.getElementById('detail-reviews-section');
  if (!section) return;
  section.innerHTML = '<div style="color:var(--text2);font-size:13px">Chargement des avis…</div>';

  loadReviewsForEvent(eventId).then(function(reviews) {
    if (reviews.length === 0) {
      section.innerHTML = '<div style="color:var(--text2);font-size:13px;text-align:center;padding:12px 0">Pas encore d\'avis. Sois le premier !</div>';
      return;
    }
    // Moyenne
    var avg = reviews.reduce(function(s, r) { return s + r.rating; }, 0) / reviews.length;
    var html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">' +
      renderStarsDisplay(Math.round(avg * 2) / 2) +
      '<span style="font-weight:700;font-size:15px">' + avg.toFixed(1) + '</span>' +
      '<span style="color:var(--text2);font-size:13px">(' + reviews.length + ' avis)</span>' +
      '</div>';

    reviews.forEach(function(r) {
      var grade = getGrade((r.profiles && r.profiles.score) || 0);
      var username = (r.profiles && r.profiles.username) || '?';
      html += '<div style="padding:10px 0;border-top:1px solid var(--bg3)">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
          '<span style="font-weight:600;font-size:13px">' + grade.emoji + ' ' + username + '</span>' +
          renderStarsDisplay(r.rating) +
        '</div>' +
        (r.comment ? '<div style="font-size:13px;color:var(--text2);line-height:1.4">' + r.comment + '</div>' : '') +
      '</div>';
    });
    section.innerHTML = html;
  });
}

// ── CONTRIBUTIONS & PROFIL ──
window.openContributionsModal = function() {
  if (!currentUser) return;
  document.getElementById('profile-modal').classList.add('hidden');
  var modal = document.getElementById('contributions-modal');
  var listEl = document.getElementById('contributions-list');
  var progressEl = document.getElementById('contributions-progress');
  listEl.innerHTML = '<div style="color:var(--text2);font-size:13px">Chargement…</div>';
  progressEl.innerHTML = '';
  modal.classList.remove('hidden');

  sb.from('reviews')
    .select('*, event_id, rating, comment, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .then(function(res) {
      var reviews = res.data || [];
      var score = reviews.length;
      var grade = getGrade(score);

      // Liste des avis
      if (reviews.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text2);font-size:13px;text-align:center;padding:20px 0">Aucun avis pour l\'instant.</div>';
      } else {
        listEl.innerHTML = reviews.map(function(r) {
          var d = new Date(r.created_at);
          var dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
          return '<div style="padding:10px 0;border-bottom:1px solid var(--bg3)">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
              renderStarsDisplay(r.rating) +
              '<span style="font-size:11px;color:var(--text2)">' + dateStr + '</span>' +
            '</div>' +
            (r.comment ? '<div style="font-size:13px;color:var(--text2)">' + r.comment + '</div>' : '') +
            '<div style="font-size:11px;color:var(--bg3);margin-top:2px">' + r.event_id + '</div>' +
          '</div>';
        }).join('');
      }

      // Barre de progression vers le prochain palier
      var nextMilestone = null;
      for (var i = 0; i < GRADE_MILESTONES.length; i++) {
        if (score < GRADE_MILESTONES[i]) { nextMilestone = GRADE_MILESTONES[i]; break; }
      }

      var progressHTML = '<div style="text-align:center;margin-bottom:16px">' +
        '<div style="font-size:36px">' + grade.emoji + '</div>' +
        '<div style="font-weight:700;font-size:16px;margin-top:4px">' + grade.label + '</div>' +
        '<div style="color:var(--text2);font-size:13px;margin-top:2px">' + score + ' avis publiés</div>' +
      '</div>';

      if (nextMilestone) {
        var prevMilestone = 0;
        for (var j = GRADE_MILESTONES.length - 1; j >= 0; j--) {
          if (GRADE_MILESTONES[j] <= score) { prevMilestone = GRADE_MILESTONES[j]; break; }
        }
        var pct = Math.round(((score - prevMilestone) / (nextMilestone - prevMilestone)) * 100);
        var nextGrade = getGrade(nextMilestone);
        progressHTML += '<div style="margin-bottom:16px">' +
          '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:6px">' +
            '<span>' + grade.emoji + ' ' + score + '</span>' +
            '<span>' + nextGrade.emoji + ' ' + nextMilestone + '</span>' +
          '</div>' +
          '<div style="background:var(--bg3);border-radius:50px;height:8px;overflow:hidden">' +
            '<div style="background:var(--accent);height:100%;width:' + pct + '%;border-radius:50px;transition:width 0.5s"></div>' +
          '</div>' +
          '<div style="text-align:center;font-size:12px;color:var(--text2);margin-top:6px">Prochain grade : ' + nextGrade.emoji + ' ' + nextGrade.label + ' (' + (nextMilestone - score) + ' avis)</div>' +
        '</div>';
      } else {
        progressHTML += '<div style="text-align:center;font-size:13px;color:var(--accent)">🎉 Grade maximum atteint !</div>';
      }

      // Tous les paliers
      progressHTML += '<div style="font-size:12px;color:var(--text2);margin-top:8px">';
      GRADES.forEach(function(g) {
        var reached = score >= g.min;
        progressHTML += '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;opacity:' + (reached ? '1' : '0.4') + '">' +
          g.emoji + ' <span style="font-weight:' + (reached ? '700' : '400') + '">' + g.label + '</span>' +
          '<span style="margin-left:auto">' + (g.min === 0 ? 'Dès le départ' : g.min + ' avis') + '</span>' +
        '</div>';
      });
      progressHTML += '</div>';

      progressEl.innerHTML = progressHTML;
    });
};

window.closeContributionsModal = function() {
  document.getElementById('contributions-modal').classList.add('hidden');
};
