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
  return sb.from('friendships')
    .delete()
    .eq('id', friendshipId)
    .then(function() { loadPendingRequests(); });
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
    '</div>';
  }).join('');
}

function renderPendingRequests() {
  var el = document.getElementById('pending-requests');
  if (!el) return;
  if (pendingRequests.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<div class="section-label">Demandes recues</div>' +
    pendingRequests.map(function(r) {
      return '<div class="friend-item">' +
        '<div class="friend-avatar">' + r.requester.username.charAt(0).toUpperCase() + '</div>' +
        '<div class="friend-name">' + r.requester.username + '</div>' +
        '<div class="friend-actions">' +
          '<button class="btn-accept" onclick="acceptFriendRequest(\'' + r.id + '\')">✓</button>' +
          '<button class="btn-reject" onclick="rejectFriendRequest(\'' + r.id + '\')">✗</button>' +
        '</div>' +
      '</div>';
    }).join('');
}

function renderSearchResults(users) {
  var el = document.getElementById('search-results');
  if (!el) return;
  if (users.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucun resultat.</div>';
    return;
  }
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

  // Attache les events après le rendu
  el.querySelectorAll('.btn-add-friend').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var userId = btn.dataset.id;
      btn.textContent = '...';
      btn.disabled = true;
      sendFriendRequest(userId).then(function() {
        btn.textContent = 'Demande envoyee !';
      }).catch(function(err) {
        btn.textContent = 'Erreur';
        console.error(err);
      });
    });
  });
}

// Search input handler
document.getElementById('friend-search-input') && document.getElementById('friend-search-input').addEventListener('input', function() {
  var q = this.value.trim();
  if (q.length < 2) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }
  searchUsers(q).then(renderSearchResults);
});
