// js/groups.js — Groupes OutNow

var currentGroup = null;
var groupMessages = [];
var groupSwipes = {};
var groupTab = 'chat';
var messagesSubscription = null;
var swipesSubscription = null;
var pollingInterval = null;
var previousScreen = 'groups';

// ── NOTIFICATIONS ──
var notifications = {
  newFriendRequest: false,
  newGroup: false,
  groups: {} // { groupId: { chat: bool, matches: bool } }
};

function updateNotificationDots() {
  // Amis
  var friendDot = document.getElementById('dot-friends');
  if (friendDot) friendDot.classList.toggle('hidden', !notifications.newFriendRequest);

  // Groupes
  var hasGroupNotif = notifications.newGroup ||
    Object.keys(notifications.groups).some(function(gid) {
      return notifications.groups[gid].chat || notifications.groups[gid].matches;
    });
  var groupDot = document.getElementById('dot-groups');
  if (groupDot) groupDot.classList.toggle('hidden', !hasGroupNotif);
}

function setGroupNotif(groupId, type, val) {
  if (!notifications.groups[groupId]) notifications.groups[groupId] = { chat: false, matches: false };
  notifications.groups[groupId][type] = val;
  updateNotificationDots();
  renderGroupListDots();
}

function renderGroupListDots() {
  Object.keys(notifications.groups).forEach(function(gid) {
    var dot = document.getElementById('group-dot-' + gid);
    if (!dot) return;
    var hasNotif = notifications.groups[gid].chat || notifications.groups[gid].matches;
    dot.classList.toggle('hidden', !hasNotif);
  });
}

// ── LISTE DES GROUPES ──
function loadUserGroups() {
  if (!currentUser) return;
  var el = document.getElementById('my-groups-list');
  if (el) el.innerHTML = '<div class="empty-state">Chargement...</div>';

  sb.from('group_members')
    .select('group_id')
    .eq('user_id', currentUser.id)
    .then(function(res) {
      if (res.error || !res.data || res.data.length === 0) {
        renderGroupList([]);
        return;
      }
      var groupIds = res.data.map(function(r) { return r.group_id; });
      sb.from('groups')
        .select('id, name, created_by')
        .in('id', groupIds)
        .then(function(res2) {
          if (res2.error) { renderGroupList([]); return; }
          renderGroupList(res2.data || []);
        });
    });
}

function renderGroupList(groups) {
  var el = document.getElementById('my-groups-list');
  if (!el) return;
  if (groups.length === 0) {
    el.innerHTML = '<div class="empty-state">Pas encore de groupe. Crees-en un !</div>';
    return;
  }
  el.innerHTML = groups.map(function(g) {
    return '<div class="group-list-item" data-gid="' + g.id + '" data-gname="' + g.name + '">' +
      '<div class="group-list-icon">👥</div>' +
      '<div class="group-list-name">' + g.name + '</div>' +
      '<div class="group-notif-dot hidden" id="group-dot-' + g.id + '"></div>' +
      '<button class="group-menu-btn" data-gid="' + g.id + '" data-gname="' + g.name + '" data-gcreator="' + g.created_by + '">⋮</button>' +
    '</div>';
  }).join('');

  el.querySelectorAll('.group-list-item').forEach(function(item) {
    item.addEventListener('click', function(e) {
      if (e.target.closest('.group-menu-btn')) return;
      if (notifications.groups[item.dataset.gid]) {
        notifications.groups[item.dataset.gid].chat = false;
        notifications.groups[item.dataset.gid].matches = false;
      }
      updateNotificationDots();
      openGroup(item.dataset.gid, item.dataset.gname);
    });
  });

  el.querySelectorAll('.group-menu-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      showGroupMenu(btn.dataset.gid, btn.dataset.gname, btn.dataset.gcreator, btn);
    });
  });

  renderGroupListDots();
}

function showGroupMenu(groupId, groupName, creatorId, anchor) {
  var existing = document.getElementById('group-dropdown');
  if (existing) existing.remove();

  var isCreator = currentUser && currentUser.id === creatorId;
  var menu = document.createElement('div');
  menu.id = 'group-dropdown';
  menu.className = 'dropdown-menu';
  menu.innerHTML =
    '<button class="dropdown-item" onclick="renameGroup(\'' + groupId + '\', \'' + groupName + '\')">✏️ Modifier le nom</button>' +
    '<button class="dropdown-item" onclick="showGroupMembersList(\'' + groupId + '\')">👥 Membres</button>' +
    '<button class="dropdown-item" onclick="addMemberToGroup(\'' + groupId + '\')">➕ Ajouter un membre</button>' +
    (isCreator ? '<button class="dropdown-item danger" onclick="deleteGroup(\'' + groupId + '\')">🗑️ Supprimer le groupe</button>' : '') +
    '<button class="dropdown-item" onclick="leaveGroup(\'' + groupId + '\')">🚪 Quitter le groupe</button>';

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

function renameGroup(groupId, currentName) {
  var newName = prompt('Nouveau nom du groupe :', currentName);
  if (!newName || newName.trim() === '') return;
  sb.from('groups').update({ name: newName.trim() }).eq('id', groupId)
    .then(function(res) {
      if (res.error) { alert('Erreur: ' + res.error.message); return; }
      loadUserGroups();
    });
}

function showGroupMembersList(groupId) {
  sb.from('group_members')
    .select('profiles(username)')
    .eq('group_id', groupId)
    .then(function(res) {
      if (res.error) return;
      var names = (res.data || []).map(function(r) { return r.profiles ? r.profiles.username : '?'; });
      alert('Membres :\n' + names.join('\n'));
    });
}

function addMemberToGroup(groupId) {
  var username = prompt('Pseudo de l\'ami a ajouter :');
  if (!username) return;
  sb.from('profiles').select('id').eq('username', username.trim()).single()
    .then(function(res) {
      if (res.error || !res.data) { alert('Utilisateur introuvable.'); return; }
      return sb.from('group_members').insert({ group_id: groupId, user_id: res.data.id });
    })
    .then(function(res) {
      if (res && res.error) { alert('Erreur: ' + res.error.message); return; }
      alert('Membre ajoute !');
    });
}

function deleteGroup(groupId) {
  if (!confirm('Supprimer ce groupe ? Cette action est irreversible.')) return;
  sb.from('group_swipes').delete().eq('group_id', groupId).then(function() {
    return sb.from('group_messages').delete().eq('group_id', groupId);
  }).then(function() {
    return sb.from('group_members').delete().eq('group_id', groupId);
  }).then(function() {
    return sb.from('groups').delete().eq('id', groupId);
  }).then(function() {
    loadUserGroups();
  }).catch(function(err) { alert('Erreur: ' + err.message); });
}

function leaveGroup(groupId) {
  if (!confirm('Quitter ce groupe ?')) return;
  sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', currentUser.id)
    .then(function() { loadUserGroups(); });
}

// ── CRÉER UN GROUPE ──
function createGroup(name, memberIds) {
  if (!currentUser || !name) return;
  sb.from('groups')
    .insert({ name: name, created_by: currentUser.id })
    .select().single()
    .then(function(res) {
      if (res.error) throw res.error;
      var groupId = res.data.id;
      var allMembers = [currentUser.id].concat(memberIds.filter(function(id) { return id !== currentUser.id; }));
      var inserts = allMembers.map(function(uid) { return { group_id: groupId, user_id: uid }; });
      return sb.from('group_members').insert(inserts).then(function(res2) {
        if (res2.error) throw res2.error;
        return groupId;
      });
    })
    .then(function(groupId) {
      notifications.newGroup = false;
      loadUserGroups();
      openGroup(groupId, name);
    })
    .catch(function(err) { alert('Erreur creation groupe: ' + err.message); });
}

// ── OUVRIR UN GROUPE ──
function openGroup(groupId, groupName) {
  currentGroup = { id: groupId, name: groupName };
  document.getElementById('group-detail-name').textContent = groupName;
  groupSwipes = {};
  groupMessages = [];
  switchGroupTab('chat');
  loadGroupMembers(groupId);
  loadGroupMessages(groupId);
  loadGroupSwipes(groupId);
  subscribeToGroup(groupId);
  showScreen('group-detail');
}

function loadGroupMembers(groupId) {
  sb.from('group_members')
    .select('user_id, profiles(id, username)')
    .eq('group_id', groupId)
    .then(function(res) {
      if (res.error) return;
      var members = (res.data || []).map(function(r) { return r.profiles; }).filter(Boolean);
      var el = document.getElementById('group-members-bar');
      if (!el) return;
      el.innerHTML = members.map(function(m) {
        return '<div class="member-chip">' + m.username.charAt(0).toUpperCase() + '<span>' + m.username + '</span></div>';
      }).join('');
    });
}

// ── CHAT ──
function loadGroupMessages(groupId) {
  sb.from('group_messages')
    .select('*, profiles(username)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(50)
    .then(function(res) {
      if (res.error) return;
      groupMessages = res.data || [];
      if (groupTab === 'chat') renderMessages();
    });
}

function sendMessage(content) {
  if (!content || !content.trim() || !currentGroup || !currentUser) return;
  sb.from('group_messages').insert({
    group_id: currentGroup.id,
    user_id: currentUser.id,
    content: content.trim()
  }).then(function(res) {
    if (res.error) console.error('sendMessage:', res.error);
  });
}

function renderMessages() {
  var el = document.getElementById('chat-messages');
  if (!el) return;
  if (groupMessages.length === 0) {
    el.innerHTML = '<div class="empty-state" style="margin-top:40px">Pas encore de messages !</div>';
    return;
  }
  el.innerHTML = groupMessages.map(function(m) {
    var isMe = m.user_id === currentUser.id;
    var author = m.profiles ? m.profiles.username : '?';
    return '<div class="message ' + (isMe ? 'message-me' : 'message-them') + '">' +
      (!isMe ? '<div class="message-author">' + author + '</div>' : '') +
      '<div class="message-bubble">' + m.content + '</div>' +
    '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function subscribeToGroup(groupId) {
  if (messagesSubscription) { try { messagesSubscription.unsubscribe(); } catch(e) {} }
  if (swipesSubscription) { try { swipesSubscription.unsubscribe(); } catch(e) {} }
  if (pollingInterval) clearInterval(pollingInterval);

  messagesSubscription = sb.channel('msg-' + groupId)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'group_messages',
      filter: 'group_id=eq.' + groupId
    }, function(payload) {
      if (payload.new.user_id !== currentUser.id) {
        groupMessages.push(payload.new);
        if (groupTab === 'chat') renderMessages();
        else setGroupNotif(groupId, 'chat', true);
      }
    })
    .subscribe();

  swipesSubscription = sb.channel('swp-' + groupId)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'group_swipes',
      filter: 'group_id=eq.' + groupId
    }, function(payload) {
      var s = payload.new;
      if (!groupSwipes[s.event_id]) groupSwipes[s.event_id] = [];
      groupSwipes[s.event_id].push(s);
      if (groupTab === 'matches') renderGroupMatches();
    })
    .subscribe();

  pollingInterval = setInterval(function() {
    if (!currentGroup) { clearInterval(pollingInterval); return; }
    if (groupTab === 'chat') {
      loadGroupMessages(currentGroup.id);
    } else if (groupTab === 'matches') {
      loadGroupSwipes(currentGroup.id);
    }
  }, 3000);
}

// ── SWIPE ──
function loadGroupSwipes(groupId) {
  sb.from('group_swipes').select('*').eq('group_id', groupId)
    .then(function(res) {
      if (res.error) return;
      groupSwipes = {};
      (res.data || []).forEach(function(s) {
        if (!groupSwipes[s.event_id]) groupSwipes[s.event_id] = [];
        groupSwipes[s.event_id].push(s);
      });
      if (groupTab === 'swipe') renderGroupSwipeDeck();
      if (groupTab === 'matches') renderGroupMatches();
    });
}

function groupSwipeEvent(eventId, direction) {
  if (!currentGroup || !currentUser) return;
  var eid = String(eventId);
  if (!groupSwipes[eid]) groupSwipes[eid] = [];
  groupSwipes[eid].push({ user_id: currentUser.id, direction: direction, event_id: eid });
  sb.from('group_swipes').insert({
    group_id: currentGroup.id,
    user_id: currentUser.id,
    event_id: eid,
    direction: direction
  }).then(function(res) {
    if (res.error && res.error.code !== '23505') console.error('groupSwipeEvent:', res.error);
    if (direction === 'like') checkForMatch(eid);
  });
}

function checkForMatch(eventId) {
  sb.from('group_members').select('user_id').eq('group_id', currentGroup.id)
    .then(function(res) {
      var total = (res.data || []).length;
      var likes = (groupSwipes[eventId] || []).filter(function(s) { return s.direction === 'like'; });
      if (total > 0 && likes.length >= total) {
        showGroupMatchModal(eventId);
        setGroupNotif(currentGroup.id, 'matches', true);
        if (groupTab === 'matches') renderGroupMatches();
      }
    });
}

function showGroupMatchModal(eventId) {
  var ev = EVENTS.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  document.getElementById('match-event-name').textContent = ev.title;
  document.getElementById('match-modal').classList.remove('hidden');
}

function renderGroupSwipeDeck() {
  var stack = document.getElementById('group-swipe-stack');
  if (!stack) return;

  var mySwipedIds = Object.keys(groupSwipes).filter(function(eid) {
    return (groupSwipes[eid] || []).find(function(s) { return s.user_id === currentUser.id; });
  });

  var remaining = EVENTS.filter(function(e) {
    return mySwipedIds.indexOf(String(e.id)) === -1;
  });

  stack.innerHTML = '';
  if (remaining.length === 0) {
    stack.innerHTML = '<div class="card-empty"><div class="empty-emoji">✅</div><h3>Tout swipe !</h3></div>';
    return;
  }

  remaining.slice(0, 3).forEach(function(ev, i) {
    var card = createCard(ev, i);
    // Override click pour aller dans detail et revenir au groupe
    card.addEventListener('click', function() {
      if (Math.abs(card._dragX || 0) < 5) {
        previousScreen = 'group-detail';
        openDetail(ev);
      }
    });
    stack.appendChild(card);
    if (i === 0) setupGroupCardSwipe(card, ev);
  });

  var cards = stack.querySelectorAll('.event-card');
  cards.forEach(function(c, i) {
    c.classList.remove('front', 'behind', 'third');
    if (i === 0) c.classList.add('front');
    else if (i === 1) c.classList.add('behind');
    else c.classList.add('third');
  });
}

function setupGroupCardSwipe(card, ev) {
  var startX = 0, currentX = 0, isDragging = false;
  var likeLabel = card.querySelector('.swipe-label.like');
  var nopeLabel = card.querySelector('.swipe-label.nope');

  function doSwipe(direction) {
    var x = direction === 'like' ? window.innerWidth * 1.5 : -window.innerWidth * 1.5;
    card.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
    card.style.transform = 'translate(' + x + 'px,0) rotate(' + (direction === 'like' ? 30 : -30) + 'deg)';
    card.style.opacity = '0';
    groupSwipeEvent(ev.id, direction);
    setTimeout(function() { card.remove(); renderGroupSwipeDeck(); }, 400);
  }

  card.addEventListener('touchstart', function(e) {
    isDragging = true; startX = e.touches[0].clientX; card.style.transition = 'none';
  }, { passive: true });
  card.addEventListener('touchmove', function(e) {
    if (!isDragging) return;
    currentX = e.touches[0].clientX - startX;
    card.style.transform = 'translate(' + currentX + 'px,0) rotate(' + (currentX * 0.08) + 'deg)';
    var r = Math.abs(currentX) / (window.innerWidth * 0.35);
    likeLabel.style.opacity = currentX > 0 ? Math.min(r, 1) : 0;
    nopeLabel.style.opacity = currentX < 0 ? Math.min(r, 1) : 0;
  }, { passive: false });
  card.addEventListener('touchend', function() {
    isDragging = false;
    var threshold = window.innerWidth * 0.35;
    if (currentX > threshold) doSwipe('like');
    else if (currentX < -threshold) doSwipe('dislike');
    else { card.style.transform = ''; likeLabel.style.opacity = 0; nopeLabel.style.opacity = 0; }
  });
  card.addEventListener('mousedown', function(e) { isDragging = true; startX = e.clientX; card.style.transition = 'none'; });
  card.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    currentX = e.clientX - startX;
    card.style.transform = 'translate(' + currentX + 'px,0) rotate(' + (currentX * 0.08) + 'deg)';
    var r = Math.abs(currentX) / (window.innerWidth * 0.35);
    likeLabel.style.opacity = currentX > 0 ? Math.min(r, 1) : 0;
    nopeLabel.style.opacity = currentX < 0 ? Math.min(r, 1) : 0;
  });
  card.addEventListener('mouseup', function() {
    isDragging = false;
    var threshold = window.innerWidth * 0.35;
    if (currentX > threshold) doSwipe('like');
    else if (currentX < -threshold) doSwipe('dislike');
    else { card.style.transform = ''; likeLabel.style.opacity = 0; nopeLabel.style.opacity = 0; }
  });

  var likeBtn = document.getElementById('grp-btn-like');
  var dislikeBtn = document.getElementById('grp-btn-dislike');
  if (likeBtn) likeBtn.onclick = function() { doSwipe('like'); };
  if (dislikeBtn) dislikeBtn.onclick = function() { doSwipe('dislike'); };
}

// ── MATCHES ──
function renderGroupMatches() {
  var el = document.getElementById('group-matches-list');
  if (!el || !currentGroup) return;
  sb.from('group_members').select('user_id').eq('group_id', currentGroup.id)
    .then(function(res) {
      var totalMembers = (res.data || []).length;
      var matches = [];
      Object.keys(groupSwipes).forEach(function(eventId) {
        var likes = (groupSwipes[eventId] || []).filter(function(s) { return s.direction === 'like'; });
        if (totalMembers > 0 && likes.length >= totalMembers) {
          var ev = EVENTS.find(function(e) { return String(e.id) === eventId; });
          if (ev) matches.push(ev);
        }
      });
      if (matches.length === 0) {
        el.innerHTML = '<div class="empty-state">Pas encore de match ! Swipez ensemble.</div>';
        return;
      }
      el.innerHTML = matches.map(function(ev) {
        return '<div class="match-card" data-evid="' + ev.id + '">' +
          '<img class="match-card-img" src="' + ev.image + '" alt="' + ev.title + '" />' +
          '<div class="match-card-info">' +
            '<div class="match-card-title">' + ev.title + '</div>' +
            '<div class="match-card-sub">' + ev.date + '</div>' +
          '</div>' +
          '<div class="match-badge">Match !</div>' +
        '</div>';
      }).join('');
      el.querySelectorAll('.match-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var ev = EVENTS.find(function(e) { return String(e.id) === card.dataset.evid; });
          if (ev) {
            previousScreen = 'group-detail';
            openDetail(ev);
          }
        });
      });
    });
}

// ── TABS ──
function switchGroupTab(tab) {
  groupTab = tab;
  document.querySelectorAll('.group-tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.group-tab-content').forEach(function(c) {
    c.classList.toggle('hidden', c.dataset.tab !== tab);
  });
  // Cache la members bar en mode swipe pour gagner de la place
  var membersBar = document.getElementById('group-members-bar');
  if (membersBar) membersBar.style.display = tab === 'swipe' ? 'none' : 'flex';

  // Efface notif du tab actif
  if (currentGroup) {
    if (tab === 'chat') setGroupNotif(currentGroup.id, 'chat', false);
    if (tab === 'matches') setGroupNotif(currentGroup.id, 'matches', false);
  }

  if (tab === 'matches') renderGroupMatches();
  if (tab === 'swipe') renderGroupSwipeDeck();
  if (tab === 'chat') renderMessages();
}
