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

function startApp() {
  showScreen('home');
  loadEvents().then(function() {
    buildDeck();
    renderCards();
  });
  updateProfileUI();
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

  if (!identifier || !password) {
    showAuthError(errEl, 'Remplis tous les champs.');
    return;
  }

  var btn = document.getElementById('btn-login');
  btn.textContent = 'Connexion...';
  btn.disabled = true;

  // Si c'est un pseudo, on cherche l'email associé
  var loginPromise;
  if (identifier.indexOf('@') === -1) {
    loginPromise = sb.from('profiles').select('id').eq('username', identifier).single()
      .then(function(res) {
        if (!res.data) throw new Error('Pseudo introuvable.');
        return sb.auth.admin ? null : res.data.id;
      })
      .then(function() {
        // On ne peut pas récupérer l'email par pseudo sans droits admin
        // On informe l'utilisateur d'utiliser son email
        throw new Error('Utilise ton adresse email pour te connecter.');
      });
  } else {
    loginPromise = sb.auth.signInWithPassword({ email: identifier, password: password });
  }

  loginPromise
    .then(function(res) {
      if (res && res.error) throw res.error;
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

  if (!username || !email || !password) {
    showAuthError(errEl, 'Remplis tous les champs.');
    return;
  }
  if (username.length < 3) {
    showAuthError(errEl, 'Le pseudo doit faire au moins 3 caracteres.');
    return;
  }
  if (password.length < 6) {
    showAuthError(errEl, 'Le mot de passe doit faire au moins 6 caracteres.');
    return;
  }

  var btn = document.getElementById('btn-register');
  btn.textContent = 'Creation...';
  btn.disabled = true;

  // Vérifie si le pseudo est déjà pris
  sb.from('profiles').select('id').eq('username', username).single()
    .then(function(res) {
      if (res.data) throw new Error('Ce pseudo est deja pris.');
      return sb.auth.signUp({ email: email, password: password });
    })
    .then(function(res) {
      if (res.error) throw res.error;
      var userId = res.data.user.id;
      return sb.from('profiles').insert({ id: userId, username: username });
    })
    .then(function(res) {
      if (res.error) throw res.error;
      showAuthError(errEl, 'Compte cree ! Verifie ton email pour confirmer.', true);
      btn.textContent = 'Creer mon compte';
      btn.disabled = false;
    })
    .catch(function(err) {
      showAuthError(errEl, err.message || 'Erreur lors de la creation du compte.');
      btn.textContent = 'Creer mon compte';
      btn.disabled = false;
    });
});

function showAuthError(el, msg, success) {
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.color = success ? '#4ade80' : 'var(--accent)';
}

// ── LOGOUT ──
window.logout = function() {
  sb.auth.signOut();
};
