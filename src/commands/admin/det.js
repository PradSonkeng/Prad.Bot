const { isGroupAdmin, isBotAdmin } = require('../../middlewares/adminCheck');
const { sendText }                  = require('../../utils/messageUtils');

module.exports = {
  name: 'det',
  aliases: ['kick', 'retirer', 'remove'],
  description: 'Retire un membre du groupe',
  category: 'admin',

  async execute({ sock, jid, from, msg }) {
    if (!jid.endsWith('@g.us')) return sendText(sock, jid, '⚠️ Groupes uniquement.');
    if (!await isGroupAdmin(sock, from, jid)) return sendText(sock, jid, '🚫 Réservé aux admins.');
    if (!await isBotAdmin(sock, jid)) return sendText(sock, jid, '🚫 Je dois être admin.');

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!mentioned?.length) return sendText(sock, jid, '⚠️ Mentionnez un membre avec @.');

    const target = mentioned[0];
    await sock.groupParticipantsUpdate(jid, [target], 'remove');

    await sock.sendMessage(jid, {
      text: `🚪 @${target.split('@')[0]} a été retiré du groupe.`,
      mentions: [target],
    });
  },
};