const { getMessageText, getMessageType } = require('../utils/messageUtils');
const { isRateLimited }                  = require('../middlewares/rateLimit');
const commandRegistry                    = require('../commands/index');
const { bot }                            = require('../config/config');
const logger                             = require('../utils/logger');

/**
 * Point d'entrée principal pour chaque message reçu.
 * Gère le routage vers la bonne commande de façon non-bloquante.
 */
async function handleMessage(sock, msg) {
  try {
    // Ignorer les messages du bot lui-même
    if (msg.key.fromMe) return;

    const jid  = msg.key.remoteJid;
    const from = msg.key.participant || jid;  // expéditeur réel (groupe ou privé)
    const text = getMessageText(msg).trim();
    const type = getMessageType(msg);

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

    // Exécution non-bloquante avec gestion d'erreur par commande
    command.execute({ sock, msg, jid, from, args, text }).catch(err => {
      logger.error({ 
        command: commandName, 
        message: err.message, 
        stack: err.stack 
      }, `Erreur commande [${commandName}]:`);
    });

  } catch (err) {
    logger.error('handleMessage fatal:', err.message);
  }
}

module.exports = { handleMessage };