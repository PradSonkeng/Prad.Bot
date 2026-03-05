# 🤖 Prad.Bot — v2.0.0

Bot WhatsApp modulaire haute performance.
Stack : Node.js · Baileys · MongoDB · PM2 · Oracle Cloud

## 📦 Installation
```bash
git clone https://github.com/PradSonkeng/Prad.Bot.git
cd Prad.Bot
npm install
cp .env.example .env   # Remplissez vos valeurs
```

## ⚙️ Configuration MongoDB (gratuit)
- **Local** : Installer MongoDB Community ou utiliser MongoDB Atlas (Free Tier)
- **Atlas** : https://www.mongodb.com/cloud/atlas → Créer un cluster gratuit M0

## 🚀 Démarrage
```bash
# Développement
npm run dev

# Production avec PM2
npm run pm2:start
npm run pm2:logs
```

## ☁️ Oracle Cloud (Free Tier)
1. Créer un compte sur https://cloud.oracle.com
2. Lancer une VM Ampere A1 (4 CPU / 24 GB RAM — GRATUIT)
3. SSH → installer Node.js 18+, MongoDB, PM2
4. `git clone` + `npm install` + `pm2 start`

## ➕ Ajouter une commande
Créer un fichier dans `src/commands/<categorie>/macommande.js` :
```js
module.exports = {
  name: 'macommande',
  description: 'Ce que ça fait',
  category: 'general',
  async execute({ sock, jid, args }) {
    await sock.sendMessage(jid, { text: 'Hello !' });
  },
};
```
**C'est tout.** Le bot la charge automatiquement au démarrage.

## 📋 Commandes disponibles
| Commande | Description | Restriction |
|----------|-------------|-------------|
| `\|\|menu` | Présentation du bot | Tous |
| `\|\|help` | Liste des commandes | Tous |
| `\|\|pp` | Photo de profil HD | Tous |
| `\|\|admin` | Liste les admins | Admins |
| `\|\|upadmin` | Promouvoir admin | Admins |
| `\|\|downadmin` | Destituer admin | Admins |
| `\|\|add` | Ajouter membre | Admins |
| `\|\|det` | Retirer membre | Admins |
| `\|\|all` | Mentionner tous | Admins |
| `\|\|extract` | Extraire média vue unique | Tous |
| `\|\|stick` | Photo/Vidéo → Sticker | Tous |
| `\|\|unstick` | Sticker → Image | Tous |

## 🔒 Sécurité
- `.env` jamais commité (protégé par `.gitignore`)
- `auth_info_baileys/` exclu du repo
- Rate limiting intégré (anti-flood)
