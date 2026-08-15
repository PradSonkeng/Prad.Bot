'use strict';

const { isGroupAdmin, isBotAdmin } = require('../../middlewares/adminCheck');
const { sendText } = require('../../utils/messageUtils');
const Group = require('../../database/models/Group');

function cleanJid(jid) {
  if (!jid) return '';
  return jid.replace(/:\d+@/, '@');
}

module.exports = {
  name: 'unmute',
  aliases: ['debloquer', 'demute', 'unmuet'],
  description: 'Débloque un membre (autorise à nouveau l\'interaction dans le groupe)',
  category: 'admin',

  async execute({ sock, jid, from, msg }) {
    if (!jid.endsWith('@g.us')) {
      return sendText(sock, jid, '⚠️ Cette commande est réservée aux groupes.');
    }
    if (!(await isGroupAdmin(sock, from, jid))) {
      return sendText(sock, jid, '🚫 Réservé aux administrateurs.');
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let target = null;
    if (ctx?.mentionedJid?.length) {
      target = ctx.mentionedJid[0];
    } else if (ctx?.participant) {
      target = ctx.participant;
    }

    if (!target) {
      return sendText(sock, jid, '⚠️ Mentionnez un membre (@) ou répondez à son message.\nExemple : `||unmute @membre`');
    }

    const targetClean = cleanJid(target);

    await Group.findOneAndUpdate(
      { groupId: jid },
      {
        $pull: { muted: { $in: [target, targetClean] } },
        $set: { updatedAt: Date.now() },
      }
    );

    await sock.sendMessage(jid, {
      text: `🔊 @${target.split('@')[0]} a été *débloqué*.\nIl peut à nouveau écrire dans le groupe.`,
      mentions: [target],
    });
  },
};
