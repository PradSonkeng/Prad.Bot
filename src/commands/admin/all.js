const { isGroupAdmin }  = require('../../middlewares/adminCheck');
const { sendText }      = require('../../utils/messageUtils');

module.exports = {
  name: 'all',
  aliases: ['tagall', 'everyone', 'touslemonde'],
  description: 'Mentionne tous les membres du groupe',
  category: 'admin',

  async execute({ sock, jid, from, args }) {
    if (!jid.endsWith('@g.us')) return sendText(sock, jid, '⚠️ Groupes uniquement.');
    if (!await isGroupAdmin(sock, from, jid)) return sendText(sock, jid, '🚫 Réservé aux admins.');

    const meta    = await sock.groupMetadata(jid);
    const members = meta.participants.map(p => p.id);
    const message = args.join(' ') || '📢 Attention à tous les membres !';

    let text = `📢 *${message}*\n\n`;
    members.forEach(m => { text += `@${m.split('@')[0]} `; });

    await sock.sendMessage(jid, { text, mentions: members });
  },
};