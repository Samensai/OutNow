# OutNow 🎉

> Plus d'excuses pour rester chez toi.

PWA mobile-first de découverte de sorties, style swipe Tinder.

---

## 🚀 Mise en ligne sur GitHub Pages (5 min)

### 1. Crée le repo GitHub

```bash
git init
git add .
git commit -m "feat: OutNow MVP v1"
```

Va sur [github.com/new](https://github.com/new), crée un repo **`outnow`** (public), puis :

```bash
git remote add origin https://github.com/TON_USERNAME/outnow.git
git branch -M main
git push -u origin main
```

### 2. Active GitHub Pages

- Va dans `Settings > Pages`
- Source : **"Deploy from branch"**
- Branch : `main` / `/ (root)`
- Clique **Save**

Ton app sera dispo sur : `https://TON_USERNAME.github.io/outnow/`

### 3. Ajoute à l'écran d'accueil iPhone

1. Ouvre l'URL dans **Safari** (obligatoire, pas Chrome)
2. Appuie sur le bouton **Partager** (carré avec flèche ↑)
3. Scroll et appuie sur **"Sur l'écran d'accueil"**
4. Nomme l'app **OutNow** → Ajouter

L'app s'ouvrira en plein écran comme une vraie app native ! ✨

---

## 📁 Architecture du projet

```
outnow/
├── index.html          → Shell de l'app + toutes les vues
├── manifest.json       → Config PWA (nom, icône, couleurs)
├── sw.js               → Service Worker (offline + cache)
├── css/
│   └── style.css       → Tous les styles (dark, mobile-first)
├── js/
│   └── app.js          → Logique complète (swipe, routing, état)
├── data/
│   └── events.js       → Données mock (à remplacer par APIs)
└── icons/
    ├── icon-192.png    → Icône PWA
    └── icon-512.png    → Icône PWA grande
```

---

## 🔌 Connecter de vraies données

Remplace le contenu de `data/events.js` par des appels API réels :

### Eventbrite
```js
const res = await fetch(
  `https://www.eventbriteapi.com/v3/events/search/?location.address=Paris&expand=venue&token=TON_TOKEN`
);
const data = await res.json();
```

### OpenAgenda (gratuit, France)
```js
const res = await fetch(
  `https://api.openagenda.com/v2/agendas/AGENDA_ID/events?key=TON_KEY&city=Lyon`
);
```

### Billetweb
Contact direct pour accès API partenaire.

---

## 🗺️ Roadmap technique

| Phase | Features |
|-------|----------|
| **MVP (maintenant)** | Swipe solo, filtres, mode groupe simulé, PWA |
| **Phase 2** | API Eventbrite + OpenAgenda, vraies données |
| **Phase 3** | Backend (Supabase), vrai mode groupe multi-joueur, auth |
| **Phase 4** | Algo de pertinence, notifications push, Outnow+ |

---

## 🛠️ Stack technique

- **Frontend** : HTML/CSS/JS vanilla (zero dépendance = rapide à charger)
- **PWA** : manifest.json + Service Worker
- **Hébergement** : GitHub Pages (gratuit)
- **Données** : Mock → APIs (Eventbrite, OpenAgenda, Billetweb)
- **Backend futur** : Supabase (auth + realtime pour le mode groupe)
