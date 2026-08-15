'use strict';

const { getMessageText, getMessageType } = require('../utils/messageUtils');
const { isRateLimited }                  = require('../middlewares/rateLimit');
const commandRegistry                    = require('../commands/index');
const { bot }                            = require('../config/config');
const logger                             = require('../utils/logger');
const Group                              = require('../database/models/Group');
const Session                            = require('../database/models/Session');

function cleanJid(jid) {
  if (!jid) return '';
  return jid.replace(/:\d+@/, '@');
}

/**
 * Point d'entrée principal pour chaque message reçu.
 * Gère le routage vers la bonne commande de façon non-bloquante.
 */
async function handleMessage(sock, msg) {
  try {

    const jid  = msg.key.remoteJid;
    const from = msg.key.participant || jid;  // expéditeur réel (groupe ou privé)
    const text = getMessageText(msg).trim();
    const type = getMessageType(msg);
    
    // Mute : supprimer les messages des membres bloqués
    if (jid.endsWith('@g.us') && from) {
      try {
        const group = await Group.findOne({ groupId: jid }).select('muted').lean();
        if (group?.muted?.length) {
          const fromClean = cleanJid(from);
          const isMuted = group.muted.some(m => cleanJid(m) === fromClean);
          if (isMuted) {
            await sock.sendMessage(jid, { delete: msg.key });
            return;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (!text && type === 'conversation') return;

    // Anti-flood
    if (isRateLimited(from)) return;

    // Vérification du préfixe
    if (!text.startsWith(bot.prefix)) return;

    const [rawCmd, ...args] = text.slice(bot.prefix.length).trim().split(/\s+/);
    const commandName = rawCmd.toLowerCase();

    const command = commandRegistry.get(commandName);
    if (!command) return;

    logger.info(`[CMD] ${from} → ${bot.prefix}${commandName} ${args.join(' ')}`);
    console.log(`[CMD] ${from} → ${bot.prefix}${commandName} ${args.join(' ')}`);
    
    // Persistance : activité session user
    if (sock.sessionId && sock.sessionType === 'user') {
      Session.updateOne(
        { sessionId: sock.sessionId },
        { $set: { lastSeen: new Date() } }
      ).catch(() => {});
    }

    // Exécution non-bloquante avec gestion d'erreur par commande
    command.execute({ sock, msg, jid, from, args, text }).catch(err => {
      logger.error(`Erreur commande [${commandName}]:`, err.message);
      console.log(`Erreur commande [${commandName}]:`, err.message);
    });

  } catch (err) {
    logger.error('handleMessage fatal:', err.message);
  }
}

module.exports = { handleMessage };
