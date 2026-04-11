// js/groups.js — Groupes OutNow

var currentGroup = null;
var groupMessages = [];
var groupSwipes = {};
var groupMatches = [];
var groupTab = 'chat';
var messagesSubscription = null;
var swipesSubscription = null;
var matchesSubscription = null;

// ── NOTIFICATIONS (definies dans supabase.js) ──

function setGroupNotif(groupId, type, val) {
  if (!notifications.groups[groupId]) notifications.groups[groupId] = { chat: false, matches: false };
  notifications.groups[groupId][type] = val;
  updateNotificationDots();
  var dot = document.getElementById('group-dot-' + groupId);
  if (dot) {
    var hasNotif = notifications.groups[groupId].chat || notifications.groups[groupId].matches;
    dot.classList.toggle('hidden', !hasNotif);
  }
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
        .select('id, name, city, created_by')
        .in('id', groupIds)
        .then(function(res2) {
          renderGroupList(res2.error ? [] : (res2.data || []));
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
  el.innerHTML = '';
  groups.forEach(function(g) {
    var item = document.createElement('div');
    item.className = 'group-list-item';

    var icon = document.createElement('div');
    icon.className = 'group-list-icon';
    icon.textContent = '👥';

    var name = document.createElement('div');
    name.className = 'group-list-name';
    name.textContent = g.name;

    var dot = document.createElement('div');
    dot.className = 'group-notif-dot hidden';
    dot.id = 'group-dot-' + g.id;

    var menuBtn = document.createElement('button');
    menuBtn.className = 'group-menu-btn';
    menuBtn.textContent = '⋮';
    menuBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      showGroupMenu(g.id, g.name, g.created_by, menuBtn);
    });

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(dot);
    item.appendChild(menuBtn);

    item.addEventListener('click', function(e) {
      if (e.target === menuBtn || menuBtn.contains(e.target)) return;
      if (notifications.groups[g.id]) {
        notifications.groups[g.id].chat = false;
        notifications.groups[g.id].matches = false;
      }
      updateNotificationDots();
      openGroup(g.id, g.name, g.city);
    });

    el.appendChild(item);
  });

  // Refresh dots
  Object.keys(notifications.groups).forEach(function(gid) {
    var d = document.getElementById('group-dot-' + gid);
    if (!d) return;
    var hasNotif = notifications.groups[gid].chat || notifications.groups[gid].matches;
    d.classList.toggle('hidden', !hasNotif);
  });
}

function showGroupMenu(groupId, groupName, creatorId, anchor) {
  var existing = document.getElementById('group-dropdown');
  if (existing) existing.remove();

  var isCreator = currentUser && currentUser.id === creatorId;
  var menu = document.createElement('div');
  menu.id = 'group-dropdown';
  menu.className = 'dropdown-menu';

  function makeItem(text, cls, action) {
    var btn = document.createElement('button');
    btn.className = 'dropdown-item' + (cls ? ' ' + cls : '');
    btn.textContent = text;
    btn.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); menu.remove(); action(); });
    btn.addEventListener('touchend', function(e) { e.preventDefault(); menu.remove(); action(); });
    return btn;
  }

  menu.appendChild(makeItem('✏️ Modifier le nom', '', function() { renameGroup(groupId, groupName); }));
  menu.appendChild(makeItem('👥 Membres', '', function() { showGroupMembersList(groupId); }));
  menu.appendChild(makeItem('➕ Ajouter un membre', '', function() { addMemberToGroup(groupId); }));
  if (isCreator) menu.appendChild(makeItem('🗑️ Supprimer le groupe', 'danger', function() { deleteGroup(groupId); }));
  menu.appendChild(makeItem('🚪 Quitter le groupe', '', function() { leaveGroup(groupId); }));

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

function renameGroup(groupId, currentName) {
  var newName = prompt('Nouveau nom du groupe :', currentName);
  if (!newName || !newName.trim()) return;
  sb.from('groups').update({ name: newName.trim() }).eq('id', groupId)
    .then(function(res) {
      if (res.error) { alert('Erreur: ' + res.error.message); return; }
      loadUserGroups();
    });
}

function showGroupMembersList(groupId) {
  sb.from('group_members').select('profiles(username)').eq('group_id', groupId)
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
      return sb.from('group_members').insert({ group_id: groupId, user_id: res.data.id })
        .then(function(r) {
          if (r.error) { alert('Erreur: ' + r.error.message); return; }
          alert('Membre ajoute !');
        });
    });
}

function deleteGroup(groupId) {
  // Supprime en parallèle les données liées, puis le groupe
  Promise.all([
    sb.from('group_swipes').delete().eq('group_id', groupId),
    sb.from('group_messages').delete().eq('group_id', groupId),
    sb.from('group_members').delete().eq('group_id', groupId)
  ]).then(function(results) {
    console.log('delete related:', results);
    return sb.from('groups').delete().eq('id', groupId);
  }).then(function(res) {
    console.log('delete group:', res);
    loadUserGroups();
  }).catch(function(err) {
    console.error('deleteGroup error:', err);
  });
}

function leaveGroup(groupId) {
  sb.from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', currentUser.id)
    .then(function(res) {
      console.log('leaveGroup:', res);
      loadUserGroups();
    })
    .catch(function(err) { console.error('leaveGroup error:', err); });
}

// ── CRÉER UN GROUPE ──
function createGroup(name, memberIds, city) {
  if (!currentUser || !name || !city) return;

  sb.from('groups')
    .insert({ name: name, city: city, created_by: currentUser.id })
    .select()
    .single()
    .then(function(res) {
      if (res.error) throw res.error;

      var groupId = res.data.id;
      var allMembers = [currentUser.id].concat(memberIds.filter(function(id) {
        return id !== currentUser.id;
      }));

      return sb.from('group_members')
        .insert(allMembers.map(function(uid) {
          return { group_id: groupId, user_id: uid };
        }))
        .then(function(r) {
          if (r.error) throw r.error;
          return groupId;
        });
    })
    .then(function(groupId) {
      loadUserGroups();
      openGroup(groupId, name, city);
    })
    .catch(function(err) {
      alert('Erreur: ' + err.message);
    });
}

// ── OUVRIR UN GROUPE ──
function openGroup(groupId, groupName, groupCity) {
  currentGroup = { id: groupId, name: groupName, city: groupCity };
  document.getElementById('group-detail-name').textContent = groupName;
  groupSwipes = {};
  groupMatches = [];
  groupMessages = [];
  switchGroupTab('chat');
  loadGroupMessages(groupId);
  loadGroupSwipes(groupId);
  loadGroupMatches(groupId);
  subscribeToGroup(groupId);
  showScreen('group-detail');
}

// ── CHAT ──
function loadGroupMessages(groupId) {
  sb.from('group_messages')
    .select('*, profiles(username)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(100)
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
  if (messagesSubscription) {
    try { messagesSubscription.unsubscribe(); } catch (e) {}
  }

  if (swipesSubscription) {
    try { swipesSubscription.unsubscribe(); } catch (e) {}
  }

  if (matchesSubscription) {
    try { matchesSubscription.unsubscribe(); } catch (e) {}
  }

  messagesSubscription = sb.channel('msg-' + groupId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'group_messages',
      filter: 'group_id=eq.' + groupId
    }, function(payload) {
      if (payload.new.user_id !== currentUser.id) {
        sb.from('profiles')
          .select('username')
          .eq('id', payload.new.user_id)
          .single()
          .then(function(profileRes) {
            var msg = payload.new;
            msg.profiles = profileRes.data || { username: '?' };
            groupMessages.push(msg);

            if (groupTab === 'chat') {
              renderMessages();
            } else {
              setGroupNotif(groupId, 'chat', true);
            }
          });
      }
    })
    .subscribe();

  swipesSubscription = sb.channel('swp-' + groupId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'group_swipes',
      filter: 'group_id=eq.' + groupId
    }, function(payload) {
      var s = payload.new;
      var eid = String(s.event_id);

      if (!groupSwipes[eid]) groupSwipes[eid] = [];

      var exists = groupSwipes[eid].some(function(item) {
        return item.user_id === s.user_id && item.direction === s.direction;
      });

      if (!exists) {
        groupSwipes[eid].push(s);
      }

      if (groupTab === 'swipe') {
        renderGroupSwipeDeck();
      }
    })
    .subscribe();

  matchesSubscription = sb.channel('match-' + groupId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'group_matches',
      filter: 'group_id=eq.' + groupId
    }, function(payload) {
      groupMatches.unshift(payload.new);

      if (groupTab === 'matches') {
        renderGroupMatches();
      } else {
        setGroupNotif(groupId, 'matches', true);
      }

      showGroupMatchModal(payload.new.event_id);
    })
    .subscribe();
}
// ── SWIPE ──
function loadGroupSwipes(groupId) {
  sb.from('group_swipes')
    .select('*')
    .eq('group_id', groupId)
    .then(function(res) {
      if (res.error) return;

      groupSwipes = {};
      (res.data || []).forEach(function(s) {
        var eid = String(s.event_id);
        if (!groupSwipes[eid]) groupSwipes[eid] = [];
        groupSwipes[eid].push(s);
      });

      if (groupTab === 'swipe') {
        renderGroupSwipeDeck();
      }
    });
}
function loadGroupMatches(groupId) {
  sb.from('group_matches')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .then(function(res) {
      if (res.error) return;
      groupMatches = res.data || [];
      if (groupTab === 'matches') {
        renderGroupMatches();
      }
    });
}

function groupSwipeEvent(eventId, direction) {
  if (!currentGroup || !currentUser) return;
  var eid = String(eventId);
  if (!groupSwipes[eid]) groupSwipes[eid] = [];
  groupSwipes[eid].push({ user_id: currentUser.id, direction: direction, event_id: eid });
  sb.from('group_swipes').insert({
    group_id: currentGroup.id, user_id: currentUser.id, event_id: eid, direction: direction
  }).then(function(res) {
    if (res.error && res.error.code !== '23505') console.error(res.error);
    if (direction === 'like') checkForMatch(eid);
  });
}

function checkForMatch(eventId) {
  sb.from('group_members')
    .select('user_id')
    .eq('group_id', currentGroup.id)
    .then(function(res) {
      var total = (res.data || []).length;
      var likes = (groupSwipes[eventId] || []).filter(function(s) {
        return s.direction === 'like';
      });

      if (total > 0 && likes.length >= total) {
        sb.from('group_matches')
          .insert({
            group_id: currentGroup.id,
            event_id: String(eventId)
          })
          .select()
          .single()
          .then(function(matchRes) {
            if (matchRes.error) {
              if (matchRes.error.code !== '23505') {
                console.error(matchRes.error);
              }
              return;
            }

            groupMatches.unshift(matchRes.data);
            showGroupMatchModal(eventId);
            setGroupNotif(currentGroup.id, 'matches', true);

            if (groupTab === 'matches') {
              renderGroupMatches();
            }
          });
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
    return mySwipedIds.indexOf(String(e.id)) === -1 && e.cityKey === currentGroup.city;
  });
  stack.innerHTML = '';
  if (remaining.length === 0) {
    stack.innerHTML = '<div class="card-empty"><div class="empty-emoji">✅</div><h3>Tout swipe !</h3></div>';
    return;
  }
  remaining.slice(0, 3).forEach(function(ev, i) {
    var card = createCard(ev, i);
    card.addEventListener('click', function() {
      if (Math.abs(card._dragX || 0) < 5) { previousScreen = 'group-detail'; openDetail(ev); }
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

  card.addEventListener('touchstart', function(e) { isDragging = true; startX = e.touches[0].clientX; card.style.transition = 'none'; }, { passive: true });
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
    var t = window.innerWidth * 0.35;
    if (currentX > t) doSwipe('like');
    else if (currentX < -t) doSwipe('dislike');
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
    var t = window.innerWidth * 0.35;
    if (currentX > t) doSwipe('like');
    else if (currentX < -t) doSwipe('dislike');
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

  var matches = groupMatches.map(function(matchRow) {
    return EVENTS.find(function(e) {
      return String(e.id) === String(matchRow.event_id);
    });
  }).filter(Boolean);

  if (matches.length === 0) {
    el.innerHTML = '<div class="empty-state">Pas encore de match !</div>';
    return;
  }

  el.innerHTML = '';
  matches.forEach(function(ev) {
    var card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML =
      '<img class="match-card-img" src="' + ev.image + '" />' +
      '<div class="match-card-info"><div class="match-card-title">' + ev.title + '</div>' +
      '<div class="match-card-sub">' + ev.date + '</div></div>' +
      '<div class="match-badge">Match !</div>';

    card.addEventListener('click', function() {
      previousScreen = 'group-detail';
      openDetail(ev);
    });

    el.appendChild(card);
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

  if (currentGroup) {
    if (tab === 'chat') setGroupNotif(currentGroup.id, 'chat', false);
    if (tab === 'matches') setGroupNotif(currentGroup.id, 'matches', false);
  }

  if (tab === 'matches' && currentGroup) {
    loadGroupMatches(currentGroup.id);
  }

  if (tab === 'swipe') {
    renderGroupSwipeDeck();
  }

  if (tab === 'chat') {
    renderMessages();
    if (currentGroup && typeof markGroupChatSeen === 'function') {
      markGroupChatSeen(currentGroup.id);
    }
  }
}
