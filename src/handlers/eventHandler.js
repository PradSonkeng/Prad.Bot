'use strict';

const Group  = require('../database/models/Group');
const Admin  = require('../database/models/Admin');
const User   = require('../database/models/User');
const logger = require('../utils/logger');
const { bot } = require('../config/config');
const { savedeleted } = require('../commands/general/reset');

const msgCache = new Map(); // cache des 100 derniers messages

/**
 * Enregistre tous les listeners d'événements WhatsApp non-messages.
 * Centralise : groupes, participants, contacts, présence, appels.
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 */
function registerEventHandlers(sock) {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. MISE À JOUR DE GROUPE (nom, description, icône, restrictions)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      try {
        const patch = { updatedAt: Date.now() };

        if (update.subject)     patch.name        = update.subject;
        if (update.desc)        patch.description = update.desc;
        if (update.announce)    patch['settings.announce']   = update.announce;
        if (update.restrict)    patch['settings.restrict']   = update.restrict;

        await Group.updateOne(
          { groupId: update.id },
          { $set: patch },
          { upsert: true }
        );

        logger.info(`[GROUP UPDATE] ${update.id} — ${JSON.stringify(patch)}`);
      } catch (err) {
        logger.error('[groups.update] Erreur :', err.message);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CHANGEMENT DE PARTICIPANTS (ajout, retrait, promotion, rétrogradation)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('group-participants.update', async ({ id: groupId, participants, action }) => {
  try {
    const botJid     = cleanJid(sock.user.lid || sock.user.id);

    // Fonction locale pour nettoyer les JIDs
    function cleanJid(j) {
      return j ? j.replace(/:\d+@/, '@') : '';
    }

    switch (action) {

      case 'add': {
        const botInList = participants.some(p =>
          cleanJid(p) === botJid
        );

        if (botInList) {
          try {
            const meta = await sock.groupMetadata(groupId);
            await Group.findOneAndUpdate(
              { groupId },
              { $set: { name: meta.subject, updatedAt: Date.now() }, $setOnInsert: { createdAt: Date.now() } },
              { upsert: true }
            );
            await sock.sendMessage(groupId, {
              text: `👋 Bonjour ! Je suis *${bot.name}* v${bot.version}.\nTapez *${bot.prefix}menu* pour me découvrir.`,
            });
          } catch (e) {
            logger.warn('[BOT ADDED] Erreur métadonnées : ' + e.message);
          }
        } else {
          for (const jid of participants) {
            try {
              await User.findOneAndUpdate(
                { jid },
                { $setOnInsert: { jid, createdAt: Date.now() }, $set: { lastSeen: Date.now() } },
                { upsert: true }
              );
              await sock.sendMessage(groupId, {
                text:     `🎉 Bienvenue @${jid.split('@')[0]} dans le groupe !`,
                mentions: [jid],
              });
            } catch (e) {
              logger.warn('[WELCOME] Erreur : ' + e.message);
            }
          }
        }
        break;
      }

      case 'remove': {
        const botInList = participants.some(p => cleanJid(p) === botJid);
        if (botInList) {
          await Group.updateOne(
            { groupId },
            { $set: { isActive: false, updatedAt: Date.now() } }
          ).catch(() => {});
          logger.warn('[BOT REMOVED] Retiré du groupe : ' + groupId);
        } else {
          for (const jid of participants) {
            await Admin.demote(jid, groupId).catch(() => {});
            await sock.sendMessage(groupId, {
              text:     `👋 @${jid.split('@')[0]} a quitté le groupe.`,
              mentions: [jid],
            }).catch(() => {});
          }
        }
        break;
      }

      case 'promote': {
        for (const jid of participants) {
          await Admin.promote(jid, groupId, 'whatsapp-native', 'admin').catch(() => {});
          await Group.updateOne(
            { groupId },
            { $addToSet: { admins: jid }, $set: { updatedAt: Date.now() } },
            { upsert: true }
          ).catch(() => {});
          logger.info('[PROMOTE] ' + jid + ' → admin dans ' + groupId);
        }
        break;
      }

      case 'demote': {
        for (const jid of participants) {
          await Admin.demote(jid, groupId).catch(() => {});
          await Group.updateOne(
            { groupId },
            { $pull: { admins: jid }, $set: { updatedAt: Date.now() } }
          ).catch(() => {});
          logger.info('[DEMOTE] ' + jid + ' → membre dans ' + groupId);
        }
        break;
      }

      default:
        logger.warn('[group-participants.update] Action inconnue : ' + action);
    }

  } catch (err) {
    logger.error('[group-participants.update] Erreur : ' + err.message);
  }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MÉTADONNÉES DE GROUPE (chargement initial ou refresh)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('groups.upsert', async (groups) => {
    for (const group of groups) {
      try {
        await Group.findOneAndUpdate(
          { groupId: group.id },
          {
            $set: {
              name:      group.subject || '',
              updatedAt: Date.now(),
            },
            $setOnInsert: { createdAt: Date.now() },
          },
          { upsert: true }
        );
        logger.info(`[GROUP UPSERT] ${group.id} — "${group.subject}"`);
      } catch (err) {
        logger.error('[groups.upsert] Erreur :', err.message);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MISE À JOUR DES CONTACTS
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('contacts.update', async (contacts) => {
    for (const contact of contacts) {
      try {
        if (!contact.id) continue;
        await User.findOneAndUpdate(
          { jid: contact.id },
          {
            $set: {
              pushName:  contact.notify || contact.name || '',
              lastSeen:  Date.now(),
              updatedAt: Date.now(),
            },
            $setOnInsert: { createdAt: Date.now() },
          },
          { upsert: true }
        );
      } catch (err) {
        logger.error('[contacts.update] Erreur :', err.message);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CONTACTS INSÉRÉS (premier contact / sync initiale)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('contacts.upsert', async (contacts) => {
    for (const contact of contacts) {
      try {
        await User.findOneAndUpdate(
          { jid: contact.id },
          {
            $setOnInsert: { jid: contact.id, createdAt: Date.now() },
            $set: {
              pushName:  contact.notify || contact.name || '',
              lastSeen:  Date.now(),
              updatedAt: Date.now(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        logger.error('[contacts.upsert] Erreur :', err.message);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. PRÉSENCE (en ligne / en train d'écrire / dernier vu)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('presence.update', async ({ id, presences }) => {
    try {
      for (const [jid, presence] of Object.entries(presences)) {
        // Mettre à jour lastSeen si l'utilisateur était "available"
        if (presence.lastKnownPresence === 'available') {
          await User.findOneAndUpdate(
            { jid },
            { $set: { lastSeen: Date.now() } },
            { upsert: false } // ne pas créer un user juste pour la présence
          );
        }
      }
    } catch (err) {
      logger.error('[presence.update] Erreur :', err.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. APPELS ENTRANTS (rejet automatique)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      try {
        if (call.status === 'offer') {
          // Rejeter automatiquement tous les appels (le bot n'est pas un humain)
          await sock.rejectCall(call.id, call.from);
          await sock.sendMessage(call.from, {
            text: `📵 Je suis un bot, je ne peux pas répondre aux appels.\nTapez *${bot.prefix}help* pour mes commandes.`,
          });
          logger.info(`[CALL REJECTED] Appel de ${call.from} rejeté automatiquement.`);
        }
      } catch (err) {
        logger.error('[call] Erreur lors du rejet :', err.message);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // . MESSAGES UPERSET (réaction ou log)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('messages.upsert', ({ messages }) => {
  for (const msg of messages) {
    if (!msg.key.fromMe && msg.message) {
      // Mettre en cache les messages pour l'anti-delete
      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || msg.message?.videoMessage?.caption
        || '';
      msgCache.set(msg.key.id, {
        text,
        sender: msg.key.participant || msg.key.remoteJid,
        jid:    msg.key.remoteJid,
        time:   (msg.messageTimestamp || Date.now() / 1000) * 1000,
      });
      // Garder seulement les 200 derniers messages
      if (msgCache.size > 200) {
        const firstKey = msgCache.keys().next().value;
        msgCache.delete(firstKey);
      }

      // Détecter suppression
      if (msg.message?.protocolMessage?.type === 0) {
        const deletedId  = msg.message.protocolMessage.key?.id;
        const cachedMsg  = msgCache.get(deletedId);
        const remoteJid  = msg.key.remoteJid;
        savedeleted.set(remoteJid, {
          text:   cachedMsg?.text || '(média ou message non textuel)',
          sender: cachedMsg?.sender || msg.key.participant || remoteJid,
          time:   cachedMsg?.time || Date.now(),
        });
        logger.info(`[ANTI-DELETE] Message récupéré dans ${remoteJid}`);
      }
    }
  }
});
  // ═══════════════════════════════════════════════════════════════════════════
  // 8. MESSAGES SUPPRIMÉS (réaction ou log)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('messages.delete', (item) => {
    try {
      if ('keys' in item) {
        for (const key of item.keys) {
          logger.info(`[MSG DELETED] Message supprimé dans ${key.remoteJid} — id: ${key.id}`);
          // Ici vous pouvez ajouter : anti-delete, log en DB, etc.
        }
      }
    } catch (err) {
      logger.error('[messages.delete] Erreur :', err.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. MESSAGES MIS À JOUR (réactions, statuts de lecture, éditions)
  // ═══════════════════════════════════════════════════════════════════════════
  sock.ev.on('messages.update', (updates) => {
    for (const update of updates) {
      try {
        const status = update.update?.status;
        // 3 = DELIVERED, 4 = READ — utile pour tracker les lectures
        if (status === 4) {
          logger.info(`[MSG READ] Message lu dans ${update.key.remoteJid}`);
        }
      } catch (err) {
        logger.error('[messages.update] Erreur :', err.message);
      }
    }
  });

  

  logger.info('✅ EventHandler : tous les listeners enregistrés.');
}

module.exports = { registerEventHandlers };