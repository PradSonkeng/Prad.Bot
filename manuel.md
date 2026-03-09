# 📖 Manuel d'utilisation — PRAD$BOT

> Guide complet pour les utilisateurs du bot WhatsApp

---

## 🚀 Comment démarrer

### Étape 1 — Contacter le bot

Cliquez sur ce lien depuis votre téléphone :

```
https://wa.me/672039320?text=||menu
```

Ou enregistrez le numéro du bot dans vos contacts et envoyez-lui un message.

### Étape 2 — Premier message

Envoyez simplement :
```
||menu
```

Le bot vous répondra avec son logo et toutes ses informations.

---

## 📋 Liste complète des commandes

---

### 🌐 COMMANDES GÉNÉRALES
> Disponibles partout — en privé et en groupe

---

#### `||menu`
**Aliases :** `||start` `||accueil`

Affiche la présentation du bot avec son logo, sa version et les infos de l'auteur.

```
Vous        → ||menu
Bot         → 🖼️ [Logo] + présentation complète
```

---

#### `||help`
**Aliases :** `||aide` `||h`

Affiche la liste complète de toutes les commandes disponibles avec leur description.

```
Vous  → ||help
Bot   → 📋 Liste de toutes les commandes
```

---

#### `||pp`
**Aliases :** `||photo` `||profilepic`

Affiche la photo de profil d'un utilisateur en haute résolution.

```
# Votre propre photo
||pp

# Photo d'un autre membre (en le mentionnant)
||pp @membre

# Photo par numéro
||pp 237XXXXXXXXX
```

> ⚠️ Si la photo est privée, le bot l'indiquera.

---

### 🎬 COMMANDES MÉDIAS
> Disponibles partout — en privé et en groupe

---

#### `||stick`
**Aliases :** `||sticker` `||s`

Convertit une photo ou vidéo en sticker WhatsApp.

```
Méthode :
1. Envoyez ou transférez une photo / vidéo
2. Répondez à ce message avec : ||stick
3. Le bot envoie le sticker ✅
```

> 💡 Pour les vidéos, ffmpeg doit être installé sur le serveur.
> La vidéo est limitée à 7 secondes.

---

#### `||unstick`
**Aliases :** `||desticker` `||toimage`

Convertit un sticker en fichier image.

```
Méthode :
1. Recevez ou trouvez un sticker
2. Répondez au sticker avec : ||unstick
3. Le bot envoie l'image correspondante ✅
```

---

#### `||extract`
**Aliases :** `||save` `||extraire`

Extrait un média envoyé en **vue unique** (photo, vidéo ou audio).

```
Méthode :
1. Recevez un média en vue unique 👁️
2. Répondez à ce message avec : ||extract
3. Le bot vous renvoie le média en haute résolution ✅
```

> 💡 Fonctionne aussi sur les médias normaux.

---

### 🛡️ COMMANDES ADMIN
> Réservées aux administrateurs du groupe uniquement

---

#### `||admin`
**Aliases :** `||admins` `||listadmin`

Affiche la liste de tous les administrateurs du groupe.

```
||admin

→ 🛡️ Admins du groupe "Nom du groupe"
   1. @Admin1 👑
   2. @Admin2 🛡️
```

---

#### `||upadmin`
**Aliases :** `||promouvoir` `||makeadmin`

Promeut un membre au rang d'administrateur.

```
Méthode :
1. Mentionnez le membre à promouvoir
   ||upadmin @membre

→ ✅ @membre est maintenant admin du groupe !
```

> ⚠️ Le bot doit être admin du groupe pour exécuter cette commande.

---

#### `||downadmin`
**Aliases :** `||destituer` `||demote`

Destituie un administrateur et le rend simple membre.

```
||downadmin @admin

→ ⬇️ @admin a été retiré des admins.
```

> ⚠️ Le bot doit être admin du groupe.

---

#### `||add`
**Aliases :** `||ajouter`

Ajoute un nouveau membre dans le groupe.

```
||add 237XXXXXXXXX

→ ✅ Membre ajouté avec succès.
```

**Codes de réponse possibles :**
```
✅ 200 → Ajouté avec succès
❌ 403 → Ce membre a bloqué les ajouts
❌ 408 → Numéro introuvable sur WhatsApp
```

> ⚠️ Le bot doit être admin du groupe.

---

#### `||det`
**Aliases :** `||kick` `||retirer` `||remove`

Retire un membre du groupe.

```
||det @membre

→ 🚪 @membre a été retiré du groupe.
```

> ⚠️ Le bot doit être admin du groupe.

---

#### `||all`
**Aliases :** `||tagall` `||everyone` `||touslemonde`

Mentionne tous les membres du groupe avec un message.

```
# Sans message
||all

# Avec message personnalisé
||all Réunion importante dans 10 minutes !

→ 📢 Réunion importante dans 10 minutes !
   @Membre1 @Membre2 @Membre3 ...
```

> ⚠️ Réservé aux admins — utilisez avec modération.

---

## ❓ Questions fréquentes

**Q : Le bot ne répond pas, que faire ?**
```
→ Vérifiez que vous utilisez le bon préfixe : ||
→ Vérifiez votre connexion internet
→ Réessayez dans quelques secondes
```

**Q : J'essaie une commande admin mais le bot dit "Réservé aux admins"**
```
→ Vous devez être administrateur du groupe
→ Le bot doit aussi être administrateur du groupe
→ Demandez au créateur du groupe de vous/le promouvoir
```

**Q : ||stick ne fonctionne pas sur ma vidéo**
```
→ La vidéo doit faire moins de 7 secondes
→ Répondez bien directement à la vidéo
→ Formats supportés : MP4, AVI, MOV
```

**Q : La photo de profil avec ||pp est introuvable**
```
→ L'utilisateur a sa photo en privé
→ Vous devez être dans ses contacts pour la voir
```

**Q : Comment savoir si le bot est en ligne ?**
```
→ Envoyez ||menu
→ Si pas de réponse après 30s → bot hors ligne
→ Contactez l'administrateur du bot
```

---

## 📞 Support

Pour toute question ou problème :

```
👨‍💻 Développeur  : PradSonkeng
🐙 GitHub       : https://github.com/PradSonkeng
💬 WhatsApp     : https://wa.me/658130830
```

---

<div align="center">

*Manuel d'utilisation — PRAD\$BOT v2.0.0*
*Fait avec ❤️ par PradSonkeng*

</div>
