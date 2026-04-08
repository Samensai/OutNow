// js/groups.js — Groupes OutNow

var currentGroup = null;
var groupMessages = [];
var groupSwipes = {};
var groupTab = 'chat';
var messagesSubscription = null;
var swipesSubscription = null;

function loadUserGroups() {
  if (!currentUser) { console.log('loadUserGroups: pas de user'); return; }
  console.log('loadUserGroups pour user:', currentUser.id);

  var el = document.getElementById('my-groups-list');
  if (el) el.innerHTML = '<div class="empty-state">Chargement...</div>';

  sb.from('group_members')
    .select('group_id')
    .eq('user_id', currentUser.id)
    .then(function(res) {
      console.log('group_members result:', JSON.stringify(res));
      if (res.error) {
        console.error('Erreur group_members:', res.error);
        if (el) el.innerHTML = '<div class="empty-state">Erreur: ' + res.error.message + '</div>';
        return;
      }
      if (!res.data || res.data.length === 0) {
        console.log('Aucun groupe trouve');
        renderGroupList([]);
        return;
      }
      var groupIds = res.data.map(function(r) { return r.group_id; });
      console.log('groupIds trouves:', groupIds);

      sb.from('groups')
        .select('id, name, created_by')
        .in('id', groupIds)
        .then(function(res2) {
          console.log('groups result:', JSON.stringify(res2));
          if (res2.error) {
            console.error('Erreur groups:', res2.error);
            return;
          }
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
    return '<div class="group-list-item" onclick="openGroup(\'' + g.id + '\', \'' + g.name + '\')">' +
      '<div class="group-list-icon">👥</div>' +
      '<div class="group-list-name">' + g.name + '</div>' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
    '</div>';
  }).join('');
}

function createGroup(name, memberIds) {
  if (!currentUser || !name) return;
  console.log('createGroup:', name, memberIds);

  sb.from('groups')
    .insert({ name: name, created_by: currentUser.id })
    .select()
    .single()
    .then(function(res) {
      console.log('group created:', JSON.stringify(res));
      if (res.error) throw res.error;
      var groupId = res.data.id;
      var allMembers = [currentUser.id].concat(memberIds.filter(function(id) { return id !== currentUser.id; }));
      var inserts = allMembers.map(function(uid) {
        return { group_id: groupId, user_id: uid };
      });
      console.log('inserting members:', inserts);
      return sb.from('group_members').insert(inserts).then(function(res2) {
        console.log('members inserted:', JSON.stringify(res2));
        if (res2.error) throw res2.error;
        return { groupId: groupId };
      });
    })
    .then(function(result) {
      loadUserGroups();
      openGroup(result.groupId, name);
    })
    .catch(function(err) {
      console.error('createGroup error:', err);
      alert('Erreur creation groupe: ' + err.message);
    });
}

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
      if (res.error) { console.error('loadGroupMembers:', res.error); return; }
      var members = (res.data || []).map(function(r) { return r.profiles; }).filter(Boolean);
      renderGroupMembersBar(members);
    });
}

function renderGroupMembersBar(members) {
  var el = document.getElementById('group-members-bar');
  if (!el) return;
  el.innerHTML = members.map(function(m) {
    return '<div class="member-chip">' + m.username.charAt(0).toUpperCase() + '<span>' + m.username + '</span></div>';
  }).join('');
}

function loadGroupMessages(groupId) {
  sb.from('group_messages')
    .select('*, profiles(username)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(50)
    .then(function(res) {
      if (res.error) { console.error('loadGroupMessages:', res.error); return; }
      groupMessages = res.data || [];
      renderMessages();
    });
}

function sendMessage(content) {
  if (!content || !content.trim() || !currentGroup) return;
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
    el.innerHTML = '<div class="empty-state" style="margin-top:40px">Pas encore de messages. Dites bonjour !</div>';
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

  messagesSubscription = sb.channel('msg-' + groupId)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'group_messages',
      filter: 'group_id=eq.' + groupId
    }, function(payload) {
      groupMessages.push(payload.new);
      if (groupTab === 'chat') renderMessages();
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
}

function loadGroupSwipes(groupId) {
  sb.from('group_swipes')
    .select('*')
    .eq('group_id', groupId)
    .then(function(res) {
      if (res.error) { console.error('loadGroupSwipes:', res.error); return; }
      groupSwipes = {};
      (res.data || []).forEach(function(s) {
        if (!groupSwipes[s.event_id]) groupSwipes[s.event_id] = [];
        groupSwipes[s.event_id].push(s);
      });
      if (groupTab === 'matches') renderGroupMatches();
      if (groupTab === 'swipe') renderGroupSwipeDeck();
    });
}

function groupSwipeEvent(eventId, direction) {
  if (!currentGroup || !currentUser) return;
  sb.from('group_swipes').insert({
    group_id: currentGroup.id,
    user_id: currentUser.id,
    event_id: String(eventId),
    direction: direction
  }).then(function(res) {
    if (res.error && res.error.code !== '23505') console.error('groupSwipeEvent:', res.error);
    if (direction === 'like') {
      if (!groupSwipes[String(eventId)]) groupSwipes[String(eventId)] = [];
      groupSwipes[String(eventId)].push({ user_id: currentUser.id, direction: 'like', event_id: String(eventId) });
      checkForMatch(String(eventId));
    }
  });
}

function checkForMatch(eventId) {
  sb.from('group_members').select('user_id').eq('group_id', currentGroup.id)
    .then(function(res) {
      var total = (res.data || []).length;
      var likes = (groupSwipes[eventId] || []).filter(function(s) { return s.direction === 'like'; });
      if (total > 0 && likes.length >= total) {
        showGroupMatchModal(eventId);
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
        return '<div class="match-card">' +
          '<img class="match-card-img" src="' + ev.image + '" alt="' + ev.title + '" />' +
          '<div class="match-card-info">' +
            '<div class="match-card-title">' + ev.title + '</div>' +
            '<div class="match-card-sub">' + ev.date + '</div>' +
          '</div>' +
          '<div class="match-badge">Match !</div>' +
        '</div>';
      }).join('');
    });
}

function switchGroupTab(tab) {
  groupTab = tab;
  document.querySelectorAll('.group-tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.group-tab-content').forEach(function(c) {
    c.classList.toggle('hidden', c.dataset.tab !== tab);
  });
  if (tab === 'matches') renderGroupMatches();
  if (tab === 'swipe') renderGroupSwipeDeck();
  if (tab === 'chat') renderMessages();
}
