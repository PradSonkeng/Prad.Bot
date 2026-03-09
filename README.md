<div align="center">

<img src="src/utils/LogoBot.JPEG" width="180" style="border-radius:50%"/>

# 🤖 PRAD\$BOT — WhatsApp Bot

[![Version](https://img.shields.io/badge/version-2.0.0-blueviolet?style=for-the-badge&logo=github)](https://github.com/PradSonkeng/Prad.Bot)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen?style=for-the-badge&logo=mongodb)](https://mongodb.com/atlas)
[![Baileys](https://img.shields.io/badge/Baileys-6.7.9-blue?style=for-the-badge)](https://github.com/whiskeysockets/baileys)
[![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)](LICENSE)
[![Status](https://img.shields.io/badge/status-En%20ligne%20🟢-success?style=for-the-badge)](https://wa.me/658130830)

> **Bot WhatsApp modulaire haute performance** — Gestion de groupes, médias, stickers et bien plus.

---

### 👤 Auteur

[![GitHub](https://img.shields.io/badge/GitHub-PradSonkeng-181717?style=for-the-badge&logo=github)](https://github.com/PradSonkeng)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-PradSonkeng-0077B5?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/prad-sonkeng-002161382?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app)
[![YouTube](https://img.shields.io/badge/YouTube-PradSONKENG-FF0000?style=for-the-badge&logo=youtube)](https://www.youtube.com/@PradSONKENG)
[![Twitter/X](https://img.shields.io/badge/Twitter%2FX-PradPrime-000000?style=for-the-badge&logo=x)](https://x.com/PradPrime)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Tester%20le%20bot-25D366?style=for-the-badge&logo=whatsapp)](https://wa.me/672039320?text=||menu)

</div>

---

## 📖 Table des matières

- [✨ Fonctionnalités](#-fonctionnalités)
- [⚙️ Stack technique](#️-stack-technique)
- [📦 Installation](#-installation)
- [🔧 Configuration](#-configuration)
- [🚀 Démarrage](#-démarrage)
- [📋 Commandes](#-commandes)
- [☁️ Déploiement Koyeb](#️-déploiement-koyeb)
- [🗂️ Structure du projet](#️-structure-du-projet)
- [➕ Ajouter une commande](#-ajouter-une-commande)
- [👤 À propos de l'auteur](#-à-propos-de-lauteur)

---

## ✨ Fonctionnalités

```
🛡️  Gestion complète des groupes (admins, membres, permissions)
🎬  Conversion photo/vidéo en stickers WebP
📸  Extraction de médias en vue unique haute résolution
👤  Photo de profil en haute résolution
⚡  Traitement concurrent — 15 messages simultanés
🔒  Anti-flood intégré (rate limiting par utilisateur)
💾  Session WhatsApp persistante dans MongoDB
🔄  Reconnexion automatique en cas de coupure
📊  Journalisation complète des actions
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

## 📦 Installation

### Prérequis

```bash
node --version   # v18.0.0 minimum
npm --version    # v8.0.0 minimum
git --version    # toute version
```

### Cloner le projet

```bash
git clone https://github.com/PradSonkeng/Prad.Bot.git
cd Prad.Bot
npm install
```

---

## 🔧 Configuration

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Ouvrir et remplir vos valeurs
nano .env
```

### Variables d'environnement

```env
# ─── MongoDB Atlas ─────────────────────────────────────
MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/whatsapp_bot

# ─── Bot ───────────────────────────────────────────────
BOT_NAME=PRAD$BOT
BOT_VERSION=2.0.0
BOT_PREFIX=||
OWNER_NUMBER=VOTRE_NUMERO_SANS_PLUS

# ─── Performances ──────────────────────────────────────
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW=60000

# ─── Serveur ───────────────────────────────────────────
PORT=3000
```

---

## 🚀 Démarrage

```bash
# Développement (avec rechargement automatique)
npm run dev

# Production
npm start

# Production avec PM2
npm run pm2:start
npm run pm2:logs
npm run pm2:stop
```

### Scanner le QR code

```
1. Lancez le bot → npm run dev
2. Ouvrez http://localhost:3000
3. Scannez le QR avec WhatsApp du numéro bot
   → WhatsApp → ⋮ → Appareils liés → Lier un appareil
4. ✅ Bot connecté et opérationnel !
```

> 💡 La session est sauvegardée dans MongoDB — vous ne rescannez qu'une seule fois.

---

## 📋 Commandes

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

## ☁️ Déploiement Koyeb

```bash
# 1. Pousser sur GitHub
git add .
git commit -m "feat: déploiement production"
git push origin main

# 2. Sur koyeb.com
→ Create App → GitHub → votre repo
→ Runtime : Node.js
→ Start cmd : node src/index.js
→ Port : 3000
→ Ajouter les variables d'environnement
→ Deploy ✅
```

```
URL publique : https://votre-app.koyeb.app
QR code      : https://votre-app.koyeb.app  (à scanner une fois)
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

C'est la grande force de l'architecture modulaire — **créer un seul fichier suffit**.

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
║           👨‍💻  PradPrime                  ║
║        Développeur & data scientist      ║
║                                          ║
║   Passionné de développement,            ║
║   d'automatisation et de technologie.    ║
║   Fonction d'étude DataScience 😎        ║
║   Créateur d'outils pour                 ║
║   simplifier le quotidien.               ║
╚══════════════════════════════════════════╝
```

[![GitHub](https://img.shields.io/badge/GitHub-Voir%20mes%20projets-181717?style=for-the-badge&logo=github)](https://github.com/PradSonkeng)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Me%20contacter-0077B5?style=for-the-badge&logo=linkedin)](https://linkedin.com/in/https://www.linkedin.com/in/prad-sonkeng-002161382?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app)
[![YouTube](https://img.shields.io/badge/YouTube-Ma%20chaîne-FF0000?style=for-the-badge&logo=youtube)](https://www.youtube.com/@PradSONKENG)
[![Twitter/X](https://img.shields.io/badge/Twitter%2FX-Me%20suivre-000000?style=for-the-badge&logo=x)](https://x.com/PradPrime)

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

[![Star](https://img.shields.io/github/stars/VOTRE_GITHUB/whatsapp-bot?style=for-the-badge&logo=github&color=yellow)](https://github.com/PradSonkeng/Prad.Bot)

*Fait avec ❤️ par PradSonkeng*

</div>
