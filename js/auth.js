// js/auth.js — Authentification OutNow

function initAuth() {
  sb.auth.onAuthStateChange(function(event, session) {
    if (session && session.user) {
      currentUser = session.user;
      loadProfile(session.user.id).then(function(profile) {
        currentProfile = profile;
        hideAuthScreen();
        startApp();
      });
    } else {
      currentUser = null;
      currentProfile = null;
      appStarted = false;
      showAuthScreen();
    }
  });
}

function showAuthScreen() {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  var s = document.getElementById('screen-auth');
  if (s) s.classList.add('active');
  document.getElementById('bottom-nav-wrap').classList.add('hidden');
}

function hideAuthScreen() {
  var s = document.getElementById('screen-auth');
  if (s) s.classList.remove('active');
  document.getElementById('bottom-nav-wrap').classList.remove('hidden');
}

var appStarted = false;
function startApp() {
  if (appStarted) return;
  appStarted = true;

  showScreen('home');
  loadEvents().then(function() { buildDeck(); renderCards(); });
  updateProfileUI();

  // Vérifie les notifs après que la nav soit visible
  setTimeout(function() {
    loadPendingRequests();
    loadUserGroups();
  }, 800);

  // Polling notifs toutes les 30 secondes
  setInterval(function() {
    if (currentUser) loadPendingRequests();
  }, 30000);

  // Polling messages toutes les 10 secondes pour tous les groupes
  var lastSeenMessages = {};
  try { lastSeenMessages = JSON.parse(localStorage.getItem('outnow_last_seen') || '{}'); } catch(e) {}

  setInterval(function() {
    if (!currentUser) return;
    sb.from('group_members').select('group_id').eq('user_id', currentUser.id)
      .then(function(res) {
        if (res.error || !res.data) return;
        res.data.forEach(function(row) {
          var gid = row.group_id;
          sb.from('group_messages').select('id, user_id, created_at')
            .eq('group_id', gid)
            .order('created_at', { ascending: false })
            .limit(1)
            .then(function(r) {
              if (r.error || !r.data || r.data.length === 0) return;
              var last = r.data[0];
              if (last.user_id === currentUser.id) return;
              var lastSeen = lastSeenMessages[gid] || '0';
              if (last.created_at > lastSeen) {
                var isInGroup = currentGroup && currentGroup.id === gid && groupTab === 'chat';
                if (!isInGroup) {
                  setGroupNotif(gid, 'chat', true);
                } else {
                  // On est dans le chat, marque comme vu
                  lastSeenMessages[gid] = last.created_at;
                  try { localStorage.setItem('outnow_last_seen', JSON.stringify(lastSeenMessages)); } catch(e) {}
                }
              }
            });
        });
      });
  }, 10000);

  // Marque les messages comme vus quand on entre dans le chat
  window.markGroupChatSeen = function(groupId) {
    sb.from('group_messages').select('created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(function(r) {
        if (r.data && r.data.length > 0) {
          lastSeenMessages[groupId] = r.data[0].created_at;
          try { localStorage.setItem('outnow_last_seen', JSON.stringify(lastSeenMessages)); } catch(e) {}
        }
      });
  };
}

function loadProfile(userId) {
  return sb.from('profiles').select('*').eq('id', userId).single()
    .then(function(res) { return res.data; });
}

function updateProfileUI() {
  if (!currentProfile) return;
  var el = document.getElementById('nav-profile-name');
  if (el) el.textContent = currentProfile.username;
}

// ── TABS ──
document.getElementById('tab-login').addEventListener('click', function() {
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-register').classList.remove('active');
  document.getElementById('form-login').classList.remove('hidden');
  document.getElementById('form-register').classList.add('hidden');
});
document.getElementById('tab-register').addEventListener('click', function() {
  document.getElementById('tab-register').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('form-register').classList.remove('hidden');
  document.getElementById('form-login').classList.add('hidden');
});

// ── LOGIN ──
document.getElementById('btn-login').addEventListener('click', function() {
  var identifier = document.getElementById('login-identifier').value.trim();
  var password = document.getElementById('login-password').value;
  var errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  if (!identifier || !password) { showAuthError(errEl, 'Remplis tous les champs.'); return; }

  var btn = document.getElementById('btn-login');
  btn.textContent = 'Connexion...';
  btn.disabled = true;

  sb.auth.signInWithPassword({ email: identifier, password: password })
    .then(function(res) {
      if (res.error) throw res.error;
    })
    .catch(function(err) {
      showAuthError(errEl, err.message || 'Erreur de connexion.');
      btn.textContent = 'Se connecter';
      btn.disabled = false;
    });
});

// ── REGISTER ──
document.getElementById('btn-register').addEventListener('click', function() {
  var username = document.getElementById('reg-username').value.trim();
  var email = document.getElementById('reg-email').value.trim();
  var password = document.getElementById('reg-password').value;
  var errEl = document.getElementById('reg-error');
  errEl.classList.add('hidden');

  if (!username || !email || !password) { showAuthError(errEl, 'Remplis tous les champs.'); return; }
  if (username.length < 3) { showAuthError(errEl, 'Pseudo trop court (3 car. min).'); return; }
  if (password.length < 6) { showAuthError(errEl, 'Mot de passe trop court (6 car. min).'); return; }

  var btn = document.getElementById('btn-register');
  btn.textContent = 'Creation...';
  btn.disabled = true;

  sb.from('profiles').select('id').eq('username', username).single()
    .then(function(res) {
      if (res.data) throw new Error('Ce pseudo est deja pris.');
      return sb.auth.signUp({
        email: email, password: password,
        options: { data: { username: username } }
      });
    })
    .then(function(res) {
      if (res.error) throw res.error;
      showAuthError(errEl, 'Compte cree ! Connecte-toi.', true);
      btn.textContent = 'Creer mon compte';
      btn.disabled = false;
    })
    .catch(function(err) {
      showAuthError(errEl, err.message || 'Erreur.');
      btn.textContent = 'Creer mon compte';
      btn.disabled = false;
    });
});

function showAuthError(el, msg, success) {
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.color = success ? '#4ade80' : 'var(--accent)';
}

window.logout = function() {
  appStarted = false;
  sb.auth.signOut();
};
