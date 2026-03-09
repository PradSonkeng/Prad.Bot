const { isGroupAdmin, isBotAdmin } = require('../../middlewares/adminCheck');
const { sendText }                  = require('../../utils/messageUtils');
const Group                         = require('../../database/models/Group');

module.exports = {
  name: 'downadmin',
  aliases: ['destituer', 'demote'],
  description: 'Destituie un admin et le rend simple membre',
  category: 'admin',

  async execute({ sock, jid, from, msg }) {
    if (!jid.endsWith('@g.us')) return sendText(sock, jid, '⚠️ Groupes uniquement.');
    if (!await isGroupAdmin(sock, from, jid)) return sendText(sock, jid, '🚫 Réservé aux admins.');
    if (!await isBotAdmin(sock, jid)) return sendText(sock, jid, '🚫 Je dois être admin.');

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!mentioned?.length) return sendText(sock, jid, '⚠️ Mentionnez un admin avec @.');

    const target = mentioned[0];
    await sock.groupParticipantsUpdate(jid, [target], 'demote');
    await Group.updateOne({ groupId: jid }, { $pull: { admins: target } });

    await sock.sendMessage(jid, {
      text: `⬇️ @${target.split('@')[0]} a été retiré des admins.`,
      mentions: [target],
    });
  },
};