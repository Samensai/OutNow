var VAPID_PUBLIC_KEY = 'BLyB5Qmz_2_6rzFn4z4ORHi4rpmKpGOT9exV2OBwLGLtPjO2YmdAC65ev8VGIfkQegvfYSonREmMuzw7DMvYfjI';

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function getPushToggleButton() {
  return null;
}

function setGroupsNavActive() {
  document.querySelectorAll('.nav-item').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.screen === 'groups');
  });
}

function savePendingPushUrl(url) {
  try {
    sessionStorage.setItem('outnow_push_url', url);
  } catch (e) {}
}

function consumePendingPushUrl() {
  try {
    var url = sessionStorage.getItem('outnow_push_url');
    if (url) sessionStorage.removeItem('outnow_push_url');
    return url;
  } catch (e) {
    return null;
  }
}

async function syncPushSubscription() {
  if (!currentUser || !isPushSupported()) return null;

  var registration = await navigator.serviceWorker.ready;
  var subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;

  var payload = {
    user_id: currentUser.id,
    endpoint: subscription.endpoint,
    subscription: subscription.toJSON(),
    platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'other',
    user_agent: navigator.userAgent,
    enabled: true,
    updated_at: new Date().toISOString()
  };

  var res = await sb
    .from('push_subscriptions')
    .upsert(payload, { onConflict: 'endpoint' });

  if (res.error) throw res.error;
  return subscription;
}

async function enablePushNotifications() {
  if (!currentUser) {
    alert('Connecte-toi d’abord.');
    return;
  }

  if (!isPushSupported()) {
    alert('Notifications push non supportées sur cet appareil.');
    updatePushButtonUI();
    return;
  }

  var permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    updatePushButtonUI();
    alert('Autorisation non accordée.');
    return;
  }

  var registration = await navigator.serviceWorker.ready;
  var subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  var saveRes = await sb.from('push_subscriptions').upsert({
    user_id: currentUser.id,
    endpoint: subscription.endpoint,
    subscription: subscription.toJSON(),
    platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'other',
    user_agent: navigator.userAgent,
    enabled: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });

  if (saveRes.error) {
    console.error(saveRes.error);
    alert('Erreur pendant l’enregistrement de l’abonnement push.');
    return;
  }

  updatePushButtonUI();
  alert('Notifications activées.');
}

function updatePushButtonUI() {
  var btn = getPushToggleButton();
  if (!btn) return;

  if (!isPushSupported()) {
    btn.textContent = 'Notifications non supportées';
    btn.disabled = true;
    btn.style.opacity = '0.6';
    return;
  }

  if (Notification.permission === 'granted') {
    btn.textContent = 'Notifications activées';
    btn.disabled = true;
    btn.style.opacity = '0.8';
    return;
  }

  if (Notification.permission === 'denied') {
    btn.textContent = 'Notifications bloquées dans le navigateur';
    btn.disabled = true;
    btn.style.opacity = '0.6';
    return;
  }

  btn.textContent = 'Activer les notifications';
  btn.disabled = false;
  btn.style.opacity = '1';
}

function handlePushNavigation(rawUrl) {
  if (!rawUrl || !currentUser) return;

  var url;
  try {
    url = new URL(rawUrl, window.location.href);
  } catch (e) {
    return;
  }

  var screen = url.searchParams.get('screen');
  var groupId = url.searchParams.get('groupId');
  var tab = url.searchParams.get('tab') || 'chat';

  if (screen !== 'groups' || !groupId) return;

  sb.from('groups')
    .select('id, name')
    .eq('id', groupId)
    .single()
    .then(function(res) {
      if (res.error || !res.data) {
        console.error('handlePushNavigation group error', res.error);
        return;
      }

      notifications.newGroup = false;
      if (notifications.groups[groupId]) {
        notifications.groups[groupId].chat = false;
        notifications.groups[groupId].matches = false;
      }
      updateNotificationDots();
      setGroupsNavActive();

      openGroup(res.data.id, res.data.name);

      if (tab === 'matches') switchGroupTab('matches');
      else if (tab === 'swipe') switchGroupTab('swipe');
      else switchGroupTab('chat');

      history.replaceState({}, document.title, window.location.pathname);
    });
}

function tryHandleCurrentUrlPushRoute() {
  var pendingUrl = consumePendingPushUrl();
  if (pendingUrl) {
    handlePushNavigation(pendingUrl);
    return;
  }
  handlePushNavigation(window.location.href);
}

window.syncPushSubscription = syncPushSubscription;
window.enablePushNotifications = enablePushNotifications;
window.updatePushButtonUI = updatePushButtonUI;
window.tryHandleCurrentUrlPushRoute = tryHandleCurrentUrlPushRoute;

(function bindPushUI() {
  var run = function() {
    var btn = getPushToggleButton();
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', function() {
        enablePushNotifications().catch(function(err) {
          console.error(err);
          alert('Erreur pendant l’activation des notifications.');
        });
      });
    }
    updatePushButtonUI();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'OPEN_FROM_PUSH' || !event.data.url) return;
    savePendingPushUrl(event.data.url);
    if (currentUser) handlePushNavigation(event.data.url);
  });
}
function requestPushOnAppStart() {
  if (!currentUser || !isPushSupported()) return;

  var alreadyAsked = false;
  try {
    alreadyAsked = localStorage.getItem('outnow_push_prompted') === '1';
  } catch (e) {}

  if (Notification.permission === 'granted') {
    syncPushSubscription().catch(console.error);
    return;
  }

  if (Notification.permission !== 'default' || alreadyAsked) return;

  try { localStorage.setItem('outnow_push_prompted', '1'); } catch (e) {}
  enablePushNotifications().catch(console.error);
}
window.requestPushOnAppStart = requestPushOnAppStart;
