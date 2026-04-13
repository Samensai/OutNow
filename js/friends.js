// js/friends.js — Système d'amis OutNow

var friendsList = [];
var pendingRequests = [];

function loadFriends() {
  if (!currentUser) return;
  sb.from('friendships')
    .select('*, requester:requester_id(id, username, score), receiver:receiver_id(id, username, score)')
    .or('requester_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
    .eq('status', 'accepted')
    .then(function(res) {
      if (res.error) { console.error('loadFriends:', res.error); return; }
      friendsList = (res.data || []).map(function(f) {
        return f.requester_id === currentUser.id ? f.receiver : f.requester;
      }).filter(Boolean);
      renderFriendsList();
    });
}

function loadPendingRequests() {
  if (!currentUser) return;
  sb.from('friendships')
    .select('*, requester:requester_id(id, username, score)')
    .eq('receiver_id', currentUser.id)
    .eq('status', 'pending')
    .then(function(res) {
      if (res.error) return;
      pendingRequests = res.data || [];
      if (typeof notifications !== 'undefined') {
        notifications.newFriendRequest = pendingRequests.length > 0;
        updateNotificationDots();
      }
      renderPendingRequests();
    });
}

// Normalise une chaîne : minuscules + suppression des accents
function normalizeStr(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function searchUsers(query) {
  if (!query || query.length < 3) return Promise.resolve([]);
  // On récupère un ensemble large et on filtre côté client pour ignorer accents et casse
  var normalized = normalizeStr(query);
  return sb.from('profiles')
    .select('id, username, score')
    .ilike('username', '%' + query + '%')
    .neq('id', currentUser.id)
    .limit(30)
    .then(function(res) {
      return (res.data || []).filter(function(u) {
        return normalizeStr(u.username).indexOf(normalized) !== -1;
      }).slice(0, 10);
    });
}

function sendFriendRequest(receiverId) {
  return sb.from('friendships').insert({
    requester_id: currentUser.id,
    receiver_id: receiverId,
    status: 'pending'
  }).then(function(res) {
    if (res.error) throw res.error;
    return true;
  });
}

function acceptFriendRequest(friendshipId) {
  return sb.from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .then(function(res) {
      if (res.error) throw res.error;
      loadFriends();
      loadPendingRequests();
    });
}

function rejectFriendRequest(friendshipId) {
  return sb.from('friendships').delete().eq('id', friendshipId)
    .then(function() { loadPendingRequests(); });
}

function removeFriend(friendId) {
  var uid = currentUser.id;
  sb.from('friendships').select('id')
    .eq('requester_id', uid).eq('receiver_id', friendId)
    .then(function(res1) {
      if (res1.data && res1.data.length > 0) return res1.data[0].id;
      return sb.from('friendships').select('id')
        .eq('requester_id', friendId).eq('receiver_id', uid)
        .then(function(res2) {
          if (res2.data && res2.data.length > 0) return res2.data[0].id;
          return null;
        });
    })
    .then(function(fid) {
      if (!fid) { console.error('Friendship not found'); return; }
      return sb.from('friendships').delete().eq('id', fid)
        .then(function(res) {
          console.log('removeFriend result:', res);
          loadFriends();
        });
    })
    .catch(function(err) { console.error('removeFriend error:', err); });
}

function createGroupWithFriend(friendId, friendName) {
  showScreen('groups');
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.toggle('active', n.dataset.screen === 'groups');
  });

  if (typeof loadUserGroups === 'function') loadUserGroups();

  setTimeout(function() {
    var picker = document.getElementById('friend-picker');


    if (!picker ) return;

    picker.innerHTML = friendsList.map(function(f) {
      return '<label class="friend-pick-item">' +
        '<input type="checkbox" value="' + f.id + '"' + (f.id === friendId ? ' checked' : '') + ' /> ' + f.username +
      '</label>';
    }).join('') || '<div class="empty-state">Ajoute des amis d\'abord !</div>';

    document.getElementById('create-group-modal').classList.remove('hidden');
  }, 100);
}
function renderFriendsList() {
  var el = document.getElementById('friends-list');
  if (!el) return;
  if (!friendsList || friendsList.length === 0) {
    el.innerHTML = '<div class="empty-state">Pas encore d\'amis. Recherche des gens par pseudo !</div>';
    return;
  }
  el.innerHTML = friendsList.map(function(f) {
    if (!f) return '';
    return '<div class="friend-item">' +
      '<div class="friend-avatar">' + f.username.charAt(0).toUpperCase() + '</div>' +
      '<div class="friend-name">' + (typeof getGrade === 'function' ? getGrade(f.score || 0).emoji + ' ' : '') + f.username + '</div>' +
      '<button class="friend-menu-btn" data-fid="' + f.id + '" data-fname="' + f.username + '">⋮</button>' +
    '</div>';
  }).join('');

  el.querySelectorAll('.friend-menu-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      showFriendMenu(btn.dataset.fid, btn.dataset.fname, btn);
    });
  });
}

function showFriendMenu(friendId, friendName, anchor) {
  var existing = document.getElementById('friend-dropdown');
  if (existing) existing.remove();

  var menu = document.createElement('div');
  menu.id = 'friend-dropdown';
  menu.className = 'dropdown-menu';

  function addItem(text, cls, action) {
    var btn = document.createElement('button');
    btn.className = 'dropdown-item' + (cls ? ' ' + cls : '');
    btn.textContent = text;
    btn.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); menu.remove(); action(); });
    btn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); menu.remove(); action(); });
    menu.appendChild(btn);
  }

  addItem('👥 Creer un groupe', '', function() { createGroupWithFriend(friendId, friendName); });
  addItem('🗑️ Supprimer l\'ami', 'danger', function() { removeFriend(friendId); });

  document.body.appendChild(menu);
  var rect = anchor.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';

  setTimeout(function() {
    document.addEventListener('click', function handler(e) {
      if (document.body.contains(menu) && !menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 100);
}

function renderPendingRequests() {
  var el = document.getElementById('pending-requests');
  if (!el) return;
  if (!pendingRequests || pendingRequests.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="section-label">Demandes recues (' + pendingRequests.length + ')</div>';
  pendingRequests.forEach(function(r) {
    if (!r || !r.requester) return;
    var item = document.createElement('div');
    item.className = 'friend-item';
    item.innerHTML = '<div class="friend-avatar">' + r.requester.username.charAt(0).toUpperCase() + '</div>' +
      '<div class="friend-name">' + (typeof getGrade === 'function' ? getGrade(r.requester.score || 0).emoji + ' ' : '') + r.requester.username + '</div>';
    var actions = document.createElement('div');
    actions.className = 'friend-actions';
    var accept = document.createElement('button');
    accept.className = 'btn-accept';
    accept.textContent = '✓';
    accept.addEventListener('click', function() { acceptFriendRequest(r.id); });
    var reject = document.createElement('button');
    reject.className = 'btn-reject';
    reject.textContent = '✗';
    reject.addEventListener('click', function() { rejectFriendRequest(r.id); });
    actions.appendChild(accept);
    actions.appendChild(reject);
    item.appendChild(actions);
    el.appendChild(item);
  });
}

function renderSearchResults(users) {
  var el = document.getElementById('search-results');
  if (!el) return;
  if (!users || users.length === 0) { el.innerHTML = '<div class="empty-state">Aucun resultat.</div>'; return; }
  el.innerHTML = '';
  users.forEach(function(u) {
    var isFriend = friendsList.find(function(f) { return f && f.id === u.id; });
    var item = document.createElement('div');
    item.className = 'friend-item';
    item.innerHTML = '<div class="friend-avatar">' + u.username.charAt(0).toUpperCase() + '</div>' +
      '<div class="friend-name">' + (typeof getGrade === 'function' ? getGrade(u.score || 0).emoji + ' ' : '') + u.username + '</div>';
    if (isFriend) {
      var badge = document.createElement('div');
      badge.className = 'friend-badge';
      badge.textContent = 'Ami';
      item.appendChild(badge);
    } else {
      var btn = document.createElement('button');
      btn.className = 'btn-add-friend';
      btn.textContent = 'Ajouter';
      btn.addEventListener('click', function() {
        btn.textContent = '...'; btn.disabled = true;
        sendFriendRequest(u.id).then(function() {
          btn.textContent = 'Envoye !';
        }).catch(function() {
          btn.textContent = 'Erreur'; btn.disabled = false;
        });
      });
      item.appendChild(btn);
    }
    el.appendChild(item);
  });
}

window.addEventListener('load', function() {
  var input = document.getElementById('friend-search-input');
  if (input) {
    input.addEventListener('input', function() {
      var q = this.value.trim();
      var resultsEl = document.getElementById('search-results');
      if (q.length < 3) { resultsEl.innerHTML = ''; return; }
      searchUsers(q).then(renderSearchResults);
    });
  }
});
var friendshipsSubscription = null;

function subscribeToFriendRequests() {
  if (!currentUser) return;
  if (friendshipsSubscription) {
    try { friendshipsSubscription.unsubscribe(); } catch (e) {}
  }

  friendshipsSubscription = sb.channel('friendships-' + currentUser.id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'friendships',
      filter: 'receiver_id=eq.' + currentUser.id
    }, function() {
      loadPendingRequests();
      loadFriends();
    })
    .subscribe();
}
