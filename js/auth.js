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

var LOADER_CYCLE = 2400; // ms — doit correspondre à la durée CSS

// Masque un loader :
// - si le chargement a duré >= 1 cycle : masque immédiatement
// - sinon : attend la fin du premier cycle
function hideLoaderAfterCycle(el, startTime) {
  if (!el) return;
  var elapsed = Date.now() - startTime;
  var delay = elapsed >= LOADER_CYCLE ? 0 : (LOADER_CYCLE - elapsed);
  setTimeout(function() {
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '0';
    setTimeout(function() {
      el.style.display = 'none';
      el.style.opacity = '1';
      el.style.transition = '';
    }, 400);
  }, delay);
}

var appStarted = false;
function startApp() {
  if (appStarted) return;
  appStarted = true;

  showScreen('home');

  // Afficher le loader home
  var homeLoader = document.getElementById('home-loading');
  if (homeLoader) { homeLoader.style.display = 'flex'; homeLoader.style.opacity = '1'; }
  var loadStart = Date.now();

  loadEvents().then(function() {
    buildDeck();
    renderCards();
    hideLoaderAfterCycle(homeLoader, loadStart);
  });

  updateProfileUI();

  setTimeout(function() {
    loadPendingRequests();
    loadFriends();
    loadUserGroups();
    if (typeof loadDoneEvents === 'function') loadDoneEvents();

    if (typeof subscribeToFriendRequests === 'function') {
      subscribeToFriendRequests();
    }

    if (typeof tryHandleCurrentUrlPushRoute === 'function') {
      tryHandleCurrentUrlPushRoute();
    }

    if (typeof requestPushOnAppStart === 'function') {
      requestPushOnAppStart();
    } else if (
      typeof syncPushSubscription === 'function' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      syncPushSubscription().catch(function(err) {
        console.error('syncPushSubscription error:', err);
      });
    }
  }, 800);

  window.markGroupChatSeen = function(groupId) {
    sb.from('group_messages')
      .select('created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(function(r) {
        if (r.data && r.data.length > 0) {
          var lastSeenMessages = {};
          try {
            lastSeenMessages = JSON.parse(localStorage.getItem('outnow_last_seen') || '{}');
          } catch (e) {}

          lastSeenMessages[groupId] = r.data[0].created_at;

          try {
            localStorage.setItem('outnow_last_seen', JSON.stringify(lastSeenMessages));
          } catch (e) {}
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

function openProfileModal() {
  if (!currentProfile) return;

  var username = currentProfile.username || '—';
  var email = currentProfile.email || (currentUser && currentUser.email) || '—';
  var score = currentProfile.score || 0;
  var grade = typeof getGrade === 'function' ? getGrade(score) : { emoji: '🌱', label: 'Curieux' };

  document.getElementById('profile-modal-username').textContent = username;
  document.getElementById('profile-modal-email').textContent = email;
  document.getElementById('profile-avatar-letter').textContent = username.charAt(0).toUpperCase();

  var gradeEl = document.getElementById('profile-modal-grade');
  if (gradeEl) gradeEl.textContent = grade.emoji + ' ' + grade.label;

  // Compter les amis
  document.getElementById('profile-modal-friends').textContent = '…';
  sb.from('friendships')
    .select('id', { count: 'exact', head: true })
    .or('requester_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
    .eq('status', 'accepted')
    .then(function(res) {
      document.getElementById('profile-modal-friends').textContent = res.count || 0;
    });

  document.getElementById('profile-modal').classList.remove('hidden');
}

// Fermer le modal en cliquant en dehors
// On utilise mousedown au lieu de click, et on vérifie que le bouton profil
// (ou l'un de ses enfants SVG) n'est pas la cible
document.addEventListener('mousedown', function(e) {
  var modal = document.getElementById('profile-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  var modalContent = modal.querySelector('.modal-content');
  var btnProfile = document.getElementById('btn-profile');
  var clickInsideModal = modalContent && modalContent.contains(e.target);
  var clickOnBtn = btnProfile && (btnProfile === e.target || btnProfile.contains(e.target));
  if (!clickInsideModal && !clickOnBtn) {
    modal.classList.add('hidden');
  }
});

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

  // Détecte si l'identifiant est un email (contient @) ou un pseudo
  var isEmail = identifier.indexOf('@') !== -1;

  function doSignIn(email) {
    sb.auth.signInWithPassword({ email: email, password: password })
      .then(function(res) {
        if (res.error) throw res.error;
      })
      .catch(function(err) {
        showAuthError(errEl, 'Identifiant ou mot de passe incorrect.');
        btn.textContent = 'Se connecter';
        btn.disabled = false;
      });
  }

  if (isEmail) {
    doSignIn(identifier);
  } else {
    // Chercher l'email correspondant au pseudo dans profiles
    sb.from('profiles')
      .select('id')
      .eq('username', identifier)
      .single()
      .then(function(res) {
        if (res.error || !res.data) throw new Error('Pseudo introuvable.');
        // Récupérer l'email via la fonction RPC ou auth admin — 
        // Supabase ne permet pas de récupérer l'email depuis profiles directement.
        // On stocke l'email dans profiles à l'inscription, on le lit ici.
        return sb.from('profiles')
          .select('email')
          .eq('username', identifier)
          .single();
      })
      .then(function(res) {
        if (res.error || !res.data || !res.data.email) {
          throw new Error('Email introuvable pour ce pseudo.');
        }
        doSignIn(res.data.email);
      })
      .catch(function(err) {
        showAuthError(errEl, err.message || 'Pseudo introuvable.');
        btn.textContent = 'Se connecter';
        btn.disabled = false;
      });
  }
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
      }).then(function(signUpRes) {
        if (signUpRes.error) throw signUpRes.error;
        // Stocker l'email dans profiles pour permettre la connexion par pseudo
        if (signUpRes.data && signUpRes.data.user) {
          sb.from('profiles')
            .upsert({ id: signUpRes.data.user.id, username: username, email: email })
            .then(function() {});
        }
        return signUpRes;
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
