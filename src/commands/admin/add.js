const { isGroupAdmin, isBotAdmin } = require('../../middlewares/adminCheck');
const { sendText }                  = require('../../utils/messageUtils');

module.exports = {
  name: 'add',
  aliases: ['ajouter'],
  description: 'Ajoute un membre dans le groupe (ex: ||add 22901234567)',
  category: 'admin',

  async execute({ sock, jid, from, args }) {
    if (!jid.endsWith('@g.us')) return sendText(sock, jid, '⚠️ Groupes uniquement.');
    if (!await isGroupAdmin(sock, from, jid)) return sendText(sock, jid, '🚫 Réservé aux admins.');
    if (!await isBotAdmin(sock, jid)) return sendText(sock, jid, '🚫 Je dois être admin.');
    if (!args[0]) return sendText(sock, jid, '⚠️ Usage : ||add <numéro>');

    const number = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    const result = await sock.groupParticipantsUpdate(jid, [number], 'add');
    const status = result[0]?.status;

    const messages = {
      200: `✅ Membre ajouté avec succès.`,
      403: `❌ Ce membre a bloqué les ajouts.`,
      408: `❌ Numéro introuvable sur WhatsApp.`,
    };
    await sendText(sock, jid, messages[status] || `⚠️ Statut inconnu : ${status}`);
  },
};