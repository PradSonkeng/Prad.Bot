const { isGroupAdmin }  = require('../../middlewares/adminCheck');
const { sendText }      = require('../../utils/messageUtils');

module.exports = {
  name: 'admin',
  aliases: ['admins', 'listadmin'],
  description: 'Liste tous les admins du groupe (réservé aux admins)',
  category: 'admin',

  async execute({ sock, jid, from, msg }) {
    if (!jid.endsWith('@g.us')) return sendText(sock, jid, '⚠️ Cette commande est réservée aux groupes.');
    if (!await isGroupAdmin(sock, from, jid)) return sendText(sock, jid, '🚫 Réservé aux admins.');

    const meta   = await sock.groupMetadata(jid);
    const admins = meta.participants.filter(p => p.admin);

    if (!admins.length) return sendText(sock, jid, 'Aucun admin trouvé.');

    let text = `🛡️ *Admins du groupe "${meta.subject}"*\n\n`;
    admins.forEach((a, i) => {
      text += `${i + 1}. @${a.id.split('@')[0]} ${a.admin === 'superadmin' ? '👑' : '🛡️'}\n`;
    });

    await sock.sendMessage(jid, {
      text,
      mentions: admins.map(a => a.id),
    });
  },
};