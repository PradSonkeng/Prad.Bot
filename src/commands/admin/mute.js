'use strict';

const { isGroupAdmin, isBotAdmin } = require('../../middlewares/adminCheck');
const { sendText } = require('../../utils/messageUtils');
const Group = require('../../database/models/Group');

function cleanJid(jid) {
  if (!jid) return '';
  return jid.replace(/:\d+@/, '@');
}

module.exports = {
  name: 'mute',
  aliases: ['bloquer', 'silence', 'muet'],
  description: 'Bloque l\'interaction d\'un membre dans le groupe (ses messages sont supprimés)',
  category: 'admin',

  async execute({ sock, jid, from, msg }) {
    if (!jid.endsWith('@g.us')) {
      return sendText(sock, jid, '⚠️ Cette commande est réservée aux groupes.');
    }
    if (!(await isGroupAdmin(sock, from, jid))) {
      return sendText(sock, jid, '🚫 Réservé aux administrateurs.');
    }
    if (!(await isBotAdmin(sock, jid))) {
      return sendText(sock, jid, '🚫 Je dois être administrateur pour supprimer les messages.');
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let target = null;
    if (ctx?.mentionedJid?.length) {
      target = ctx.mentionedJid[0];
    } else if (ctx?.participant) {
      target = ctx.participant;
    }

    if (!target) {
      return sendText(sock, jid, '⚠️ Mentionnez un membre (@) ou répondez à son message.\nExemple : `||mute @membre`');
    }

    const targetClean = cleanJid(target);

    if (await isGroupAdmin(sock, target, jid)) {
      return sendText(sock, jid, '🚫 Impossible de bloquer un administrateur.');
    }

    await Group.findOneAndUpdate(
      { groupId: jid },
      {
        $addToSet: { muted: targetClean },
        $set: { updatedAt: Date.now() },
      },
      { upsert: true }
    );

    await sock.sendMessage(jid, {
      text: `🔇 @${target.split('@')[0]} a été *bloqué* dans ce groupe.\nSes messages seront automatiquement supprimés.\n\nPour débloquer : \`||unmute @membre\``,
      mentions: [target],
    });
  },
};
