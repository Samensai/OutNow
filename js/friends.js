// js/friends.js — Système d'amis OutNow

var friendsList = [];
var pendingRequests = [];

function initFriends() {
  loadFriends();
  loadPendingRequests();
}

function loadFriends() {
  if (!currentUser) return;
  sb.from('friendships')
    .select('*, requester:requester_id(id, username), receiver:receiver_id(id, username)')
    .or('requester_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
    .eq('status', 'accepted')
    .then(function(res) {
      if (res.error) return;
      friendsList = (res.data || []).map(function(f) {
        return f.requester_id === currentUser.id ? f.receiver : f.requester;
      });
      renderFriendsList();
    });
}

function loadPendingRequests() {
  if (!currentUser) return;
  sb.from('friendships')
    .select('*, requester:requester_id(id, username)')
    .eq('receiver_id', currentUser.id)
    .eq('status', 'pending')
    .then(function(res) {
      if (res.error) return;
      pendingRequests = res.data || [];
      // Notif point rouge si demandes en attente
      if (typeof notifications !== 'undefined') {
        notifications.newFriendRequest = pendingRequests.length > 0;
        updateNotificationDots();
      }
      renderPendingRequests();
    });
}

function searchUsers(query) {
  if (!query || query.length < 2) return Promise.resolve([]);
  return sb.from('profiles')
    .select('id, username')
    .ilike('username', '%' + query + '%')
    .neq('id', currentUser.id)
    .limit(10)
    .then(function(res) { return res.data || []; });
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
  if (!confirm('Supprimer cet ami ?')) return;
  var uid = currentUser.id;
  // Cherche d'abord la friendship
  sb.from('friendships')
    .select('id')
    .or('and(requester_id.eq.' + uid + ',receiver_id.eq.' + friendId + '),and(requester_id.eq.' + friendId + ',receiver_id.eq.' + uid + ')')
    .then(function(res) {
      if (res.error || !res.data || res.data.length === 0) {
        alert('Amitie introuvable.'); return;
      }
      var fid = res.data[0].id;
      return sb.from('friendships').delete().eq('id', fid);
    })
    .then(function() {
      var existing = document.getElementById('friend-dropdown');
      if (existing) existing.remove();
      loadFriends();
    })
    .catch(function(err) { console.error(err); alert('Erreur: ' + (err.message || JSON.stringify(err))); });
}

function createGroupWithFriend(friendId, friendName) {
  // Pré-sélectionne l'ami et ouvre la modal de création de groupe
  showScreen('groups');
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.toggle('active', n.dataset.screen === 'groups');
  });
  loadUserGroups();
  setTimeout(function() {
    var picker = document.getElementById('friend-picker');
    if (!picker) return;
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
  if (friendsList.length === 0) {
    el.innerHTML = '<div class="empty-state">Pas encore d\'amis. Recherche des gens par pseudo !</div>';
    return;
  }
  el.innerHTML = friendsList.map(function(f) {
    return '<div class="friend-item">' +
      '<div class="friend-avatar">' + f.username.charAt(0).toUpperCase() + '</div>' +
      '<div class="friend-name">' + f.username + '</div>' +
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
  menu.innerHTML =
    '<button class="dropdown-item" onclick="createGroupWithFriend(\'' + friendId + '\', \'' + friendName + '\')">👥 Creer un groupe</button>' +
    '<button class="dropdown-item danger" onclick="removeFriend(\'' + friendId + '\')">🗑️ Supprimer l\'ami</button>';

  document.body.appendChild(menu);
  var rect = anchor.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';

  setTimeout(function() {
    document.addEventListener('click', function handler() {
      menu.remove();
      document.removeEventListener('click', handler);
    });
  }, 10);
}

function renderPendingRequests() {
  var el = document.getElementById('pending-requests');
  if (!el) return;
  if (pendingRequests.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="section-label">Demandes recues (' + pendingRequests.length + ')</div>' +
    pendingRequests.map(function(r) {
      return '<div class="friend-item">' +
        '<div class="friend-avatar">' + r.requester.username.charAt(0).toUpperCase() + '</div>' +
        '<div class="friend-name">' + r.requester.username + '</div>' +
        '<div class="friend-actions">' +
          '<button class="btn-accept" data-id="' + r.id + '">✓</button>' +
          '<button class="btn-reject" data-id="' + r.id + '">✗</button>' +
        '</div>' +
      '</div>';
    }).join('');

  el.querySelectorAll('.btn-accept').forEach(function(btn) {
    btn.addEventListener('click', function() { acceptFriendRequest(btn.dataset.id); });
  });
  el.querySelectorAll('.btn-reject').forEach(function(btn) {
    btn.addEventListener('click', function() { rejectFriendRequest(btn.dataset.id); });
  });
}

function renderSearchResults(users) {
  var el = document.getElementById('search-results');
  if (!el) return;
  if (users.length === 0) { el.innerHTML = '<div class="empty-state">Aucun resultat.</div>'; return; }
  el.innerHTML = users.map(function(u) {
    var isFriend = friendsList.find(function(f) { return f.id === u.id; });
    return '<div class="friend-item">' +
      '<div class="friend-avatar">' + u.username.charAt(0).toUpperCase() + '</div>' +
      '<div class="friend-name">' + u.username + '</div>' +
      (isFriend
        ? '<div class="friend-badge">Ami</div>'
        : '<button class="btn-add-friend" data-id="' + u.id + '">Ajouter</button>'
      ) +
    '</div>';
  }).join('');

  el.querySelectorAll('.btn-add-friend').forEach(function(btn) {
    btn.addEventListener('click', function() {
      btn.textContent = '...'; btn.disabled = true;
      sendFriendRequest(btn.dataset.id).then(function() {
        btn.textContent = 'Demande envoyee !';
      }).catch(function() {
        btn.textContent = 'Erreur'; btn.disabled = false;
      });
    });
  });
}

var friendSearchInput = document.getElementById('friend-search-input');
if (friendSearchInput) {
  friendSearchInput.addEventListener('input', function() {
    var q = this.value.trim();
    if (q.length < 2) { document.getElementById('search-results').innerHTML = ''; return; }
    searchUsers(q).then(renderSearchResults);
  });
}
