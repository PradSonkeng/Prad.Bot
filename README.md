<div align="center"> 

<img src="src/utils/LogoBot.JPEG" width="180" style="border-radius:50%"/>

# 🤖 PRAD\$BOT — WhatsApp Bot

[![Version](https://img.shields.io/badge/version-2.0.0-blueviolet?style=flatge&logo=github)](https://github.com/PradSonkeng/Prad.Bot)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat&logo=node.js)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen?style=flat&logo=mongodb)](https://mongodb.com/atlas)
[![Baileys](https://img.shields.io/badge/Baileys-6.7.9-blue?flat)](https://github.com/whiskeysockets/baileys)
[![License](https://img.shields.io/badge/license-MIT-orange?style=flat)](LICENSE)
[![Status](https://img.shields.io/badge/status-En%20ligne%20🟢-success?style=flat)](https://uncomfortable-christiana-pard-tech-58d941b2.koyeb.app/user)

> **Bot WhatsApp multi-sessions** — Gestion de groupes, médias, stickers et bien plus.

---

### 👤 Auteur

[![GitHub](https://img.shields.io/badge/GitHub-PradSonkeng-181717?style=flat&logo=github)](https://github.com/PradSonkeng)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-PradSonkeng-0077B5?style=flat&logo=linkedin)](https://www.linkedin.com/in/prad-sonkeng-002161382/)
[![YouTube](https://img.shields.io/badge/YouTube-PradSONKENG-FF0000?style=flat&logo=youtube)](https://youtube.com/@pradsonkeng?si=dXDUUBdJyGyQVUHk)
[![Twitter/X](https://img.shields.io/badge/Twitter%2FX-PradPrime-000000?style=flat&logo=x)](https://x.com/PradPrime)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Me%20Contacter-25D366?style=flat&logo=whatsapp)](https://wa.me/658130830)

</div>

---

## 📖 Table des matières

- [✨ Fonctionnalités](#-fonctionnalités)
- [⚙️ Stack technique](#️-stack-technique)
- [👥 Mode multi-sessions (users)](#-mode-multi-sessions-users)
- [🔐 Panneau administrateur](#-panneau-administrateur)
- [📊 Statistiques](#-statistiques)
- [🌐 Pages web](#-pages-web)
- [📋 Commandes](#-commandes)
- [🗂️ Structure du projet](#️-structure-du-projet)
- [➕ Ajouter une commande](#-ajouter-une-commande)
- [👤 À propos de l'auteur](#-à-propos-de-lauteur)

---

## ✨ Fonctionnalités

```
👥  Multi-sessions — 1 session bot principale + N sessions utilisateurs
🔗  Connexion user via page /user (QR ou code pairing)
🆕  Boutons « Nouvelle connexion » et « Déconnecter » côté user
🔐  Panneau admin protégé (/admin) — activer, désactiver, supprimer
📊  Stats par session (commandes, dernière commande, top commandes)
🛡️  Gestion complète des groupes (admins, kick, tagall, etc.)
🎬  Stickers, extraction vue unique, photo de profil HD
💾  Sessions persistantes dans MongoDB Atlas
🔄  Restauration automatique des sessions actives au démarrage
🔒  Anti-flood (rate limiting) + nettoyage des sessions inactives
```

---

## ⚙️ Stack technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Runtime | Node.js | 18+ |
| WhatsApp API | @whiskeysockets/baileys | 6.7.9 |
| Base de données | MongoDB Atlas | 7.x |
| Traitement médias | Sharp + FFmpeg | Latest |
| File de messages | p-queue | 8.x |
| Serveur web (QR) | Express | 4.x |
| Process manager | PM2 | 5.x |
| Hébergement | Koyeb Free Tier | — |

---

## 👥 Mode multi-sessions (users)

Le bot gère **deux types de sessions** :

| Type | Rôle |
|------|------|
| **main** | Numéro officiel du bot (page `/`) |
| **user** | WhatsApp personnel d'un utilisateur (page `/user`) |

### Comment un utilisateur connecte son WhatsApp

1. Ouvrir l'URL publique **`/user`**
2. Scanner le **QR code** ou utiliser le **code pairing** (numéro + code)
3. Une fois connecté : message « WhatsApp connecté ! »
4. Les chats restent normaux ; les commandes du bot sont disponibles sur ce compte

### Boutons côté user (après connexion)

| Bouton | Effet |
|--------|--------|
| **Nouvelle connexion** | Efface la session du navigateur et crée une **nouvelle** session (QR / pairing frais). L'ancienne reste côté serveur jusqu'à suppression admin. |
| **Déconnecter cette session** | Supprime la session sur le serveur **et** le stockage local du navigateur, puis propose une nouvelle connexion. |

### Persistance navigateur

- Le `sessionId` est stocké en **localStorage** (`prad_user_session`)
- Même appareil / même navigateur → reprise de la même session au refresh
- **Autre appareil** → nouvelle session possible (localStorage isolé)

---

## 🔐 Panneau administrateur

URL : **`/admin`**

Protégé par le secret **`ADMIN_SECRET`** (variable d'environnement).

### Capacités

- Liste de **toutes** les sessions (main + users)
- Statut live : connecté / offline / qr / pairing / conflict…
- **Activer / Désactiver** une session user (ferme le socket, conserve les credentials)
- **Supprimer** définitivement une session (creds inclus)
- Filtres : Tous / Connectés / Actifs / Inactifs + recherche
- Cartes de stats globales en haut de page
- Rafraîchissement auto toutes les 15 s

La session **main** ne peut pas être désactivée ni supprimée depuis le panneau.

---

## 📊 Statistiques

Pour chaque session **user**, à chaque commande exécutée :

| Champ | Description |
|-------|-------------|
| `commandCount` | Nombre total de commandes |
| `lastCommand` | Nom de la dernière commande |
| `lastCommandAt` | Horodatage de la dernière commande |
| `commandsByName` | Compteur par commande (ex. `menu×12`, `stick×5`) |

Affichées dans le tableau admin (total + top 3 des commandes).

---

## 🌐 Pages web

| Page | URL | Accès |
|------|-----|--------|
| Session bot (main) | `/` | Public |
| Connexion utilisateur | `/user` | Public |
| Panneau admin | `/admin` | Secret `ADMIN_SECRET` |
| Santé (health check) | `/health` | Public (JSON) |

API admin (header `x-admin-secret` ou query `key`) :

- `GET  /admin/api/sessions` — liste détaillée
- `GET  /admin/api/stats` — agrégats
- `POST /admin/api/session/active` — `{ sessionId, active }`
- `POST /admin/api/session/remove` — `{ sessionId }`
---

## 📋 Commandes

Préfixe par défaut : **`||`**. Voici quelque commande du bot WhatsApp

### 🌐 Générales — Disponibles partout

| Commande | Aliases | Description |
|----------|---------|-------------|
| `\|\|menu` | `start`, `accueil` | Présentation du bot avec logo |
| `\|\|help` | `aide`, `h` | Liste toutes les commandes |
| `\|\|pp` | `photo` | Photo de profil HD d'un utilisateur |

### 🛡️ Admin — Réservées aux admins de groupe

| Commande | Aliases | Description |
|----------|---------|-------------|
| `\|\|admin` | `admins` | Liste les admins du groupe |
| `\|\|upadmin` | `promouvoir` | Promeut un membre admin |
| `\|\|downadmin` | `destituer` | Destituie un admin |
| `\|\|add` | `ajouter` | Ajoute un membre dans le groupe |
| `\|\|det` | `kick` | Retire un membre du groupe |
| `\|\|all` | `tagall` | Mentionne tous les membres |

### 🎬 Médias — Disponibles partout

| Commande | Aliases | Description |
|----------|---------|-------------|
| `\|\|stick` | `sticker`, `s` | Convertit photo/vidéo en sticker |
| `\|\|unstick` | `toimage` | Convertit sticker en image |
| `\|\|extract` | `save` | Extrait un média en vue unique |

### 💡 Exemples d'utilisation

```
# Créer un sticker
→ Envoyez une photo
→ Répondez-y avec : ||stick

# Extraire une vue unique
→ Recevez un média en vue unique
→ Répondez avec : ||extract

# Photo de profil d'un membre
→ ||pp @membre

# Mentionner tout le groupe
→ ||all Réunion dans 5 minutes !
```

---

## 🗂️ Structure du projet

```
Prad.bot/

├── 📁 src/
│   ├── index.js                  ← Point d'entrée
│   ├── 📁 config/
│   │   └── config.js             ← Configuration centrale
│   ├── 📁 database/
│   │   ├── connection.js         ← Connexion MongoDB
│   │   └── 📁 models/
│   │       ├── Admin.js          ← Modèle admin (permissions granulaires)
│   │       ├── Group.js          ← Modèle groupe
│   │       ├── Session.js        ← Session WhatsApp persistante
│   │       └── User.js           ← Modèle utilisateur
│   ├── 📁 sessions/
│   │   └── SessionManager.js    ← multi-sessions, active/inactive, détail admin
│   ├── 📁 handlers/
│   │   ├── messageHandler.js     ← Routeur de messages
│   │   └── eventHandler.js       ← Événements WhatsApp
│   ├── 📁 middlewares/
│   │   ├── adminCheck.js         ← Vérification admin (LID compatible)
│   │   └── rateLimit.js          ← Anti-flood
│   ├── 📁 commands/
│   │   ├── index.js              ← Registre auto des commandes
│   │   ├── 📁 general/
│   │   │   ├── menu.js
│   │   │   ├── help.js
│   │   │   └── pp.js
│   │   ├── 📁 admin/
│   │   │   ├── admin.js
│   │   │   ├── upadmin.js
│   │   │   ├── downadmin.js
│   │   │   ├── add.js
│   │   │   ├── det.js
│   │   │   └── all.js
│   │   └── 📁 media/
│   │       ├── extract.js
│   │       ├── stick.js
│   │       └── unstick.js
│   └── 📁 utils/
|       ├── LogoBot.JPEG          ← Logo du bot
│       ├── logger.js             ← Journalisation Pino
│       ├── mediaUtils.js         ← Utilitaires médias
│       ├── messageUtils.js       ← Utilitaires messages
│       └── sessionStore.js       ← Gestion session MongoDB
├── 📁 logs/                      ← Logs (ignoré par Git)
├── 📁 temp/                      ← Fichiers temporaires (ignoré par Git)
├── .env                          ← Variables (ignoré par Git)
├── .env.example                  ← Exemple de configuration
├── .gitignore
├── ecosystem.config.js           ← Configuration PM2
├── nodemon.json                  ← Configuration Nodemon
└── package.json
```

---

## ➕ Ajouter une commande

Créer un fichier dans le bon dossier suffit :

```js
// src/commands/general/macommande.js

module.exports = {
  name:        'macommande',
  aliases:     ['mc', 'cmd'],
  description: 'Description de ma commande',
  category:    'general',       // general | admin | media

  async execute({ sock, jid, from, args, msg }) {
    await sock.sendMessage(jid, { text: '👋 Ma commande fonctionne !' });
  },
};
```

```
✅ Sauvegardez le fichier
✅ Le bot la charge automatiquement au prochain démarrage
✅ Elle apparaît dans ||help automatiquement
✅ Aucun autre fichier à modifier
```

---

## 👤 À propos de l'auteur

<div align="center">

```
╔══════════════════════════════════════════╗
║           👨‍💻  PradSonkeng               ║
║        Développeur & data scientist      ║
║                                          ║
║   Passionné de développement,            ║
║   d'automatisation et de technologie.    ║
║   Fonction d'étude DataScience 😎        ║
║   Créateur d'outils pour                 ║
║   simplifier le quotidien.               ║
╚══════════════════════════════════════════╝
```

</div>

---

## 📜 Licence

```
MIT License — Libre d'utilisation, modification et distribution.
© 2025 PradSonkeng — Tous droits réservés.
```

---

<div align="center">

⭐ **Si ce projet vous a aidé, laissez une étoile sur GitHub !** ⭐

[![Star](https://img.shields.io/github/stars/PradSonkeng/Prad.Bot?style=flat&logo=github&color=yellow)](https://github.com/PradSonkeng/Prad.Bot)

*Fait par PradSonkeng*

</div>
