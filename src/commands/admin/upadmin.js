const { isGroupAdmin, isBotAdmin } = require('../../middlewares/adminCheck');
const { sendText }                  = require('../../utils/messageUtils');
const Group                         = require('../../database/models/Group');

module.exports = {
  name: 'upadmin',
  aliases: ['promouvoir', 'makeadmin'],
  description: 'Élève un membre au rang d\'administrateur du groupe',
  category: 'admin',

  async execute({ sock, jid, from, msg }) {
    if (!jid.endsWith('@g.us')) return sendText(sock, jid, '⚠️ Groupes uniquement.');
    if (!await isGroupAdmin(sock, from, jid)) return sendText(sock, jid, '🚫 Réservé aux admins.');

    const botJid = sock.user.id;
    if (!await isBotAdmin(sock, jid)) return sendText(sock, jid, '🚫 Je dois être admin pour faire ça.');

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!mentioned?.length) return sendText(sock, jid, '⚠️ Mentionnez un membre avec @.');

    const target = mentioned[0];
    await sock.groupParticipantsUpdate(jid, [target], 'promote');

    // Enregistrement en DB
    await Group.updateOne({ groupId: jid }, { $addToSet: { admins: target } }, { upsert: true });

    await sock.sendMessage(jid, {
      text: `✅ @${target.split('@')[0]} est maintenant *admin* du groupe !`,
      mentions: [target],
    });
  },
};