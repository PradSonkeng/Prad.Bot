'use strict';

const { isGroupAdmin, isBotAdmin } = require('../../middlewares/adminCheck');
const { sendText } = require('../../utils/messageUtils');
const Group = require('../../database/models/Group');

module.exports = {
  name: 'fermer',
  aliases: ['close', 'lock', 'bloquergroupe'],
  description: 'Ferme le groupe — seuls les admins peuvent écrire',
  category: 'admin',

  async execute({ sock, jid, from }) {
    if (!jid.endsWith('@g.us')) {
      return sendText(sock, jid, '⚠️ Cette commande est réservée aux groupes.');
    }
    if (!(await isGroupAdmin(sock, from, jid))) {
      return sendText(sock, jid, '🚫 Réservé aux administrateurs.');
    }
    if (!(await isBotAdmin(sock, jid))) {
      return sendText(sock, jid, '🚫 Je dois être administrateur du groupe.');
    }

    try {
      await sock.groupSettingUpdate(jid, 'announcement');
      await Group.findOneAndUpdate(
        { groupId: jid },
        { $set: { 'settings.announcement': true, updatedAt: Date.now() } },
        { upsert: true }
      );
      await sendText(sock, jid, '🔒 *Groupe fermé*\nSeuls les administrateurs peuvent envoyer des messages.');
    } catch (err) {
      await sendText(sock, jid, '❌ Impossible de fermer le groupe : ' + err.message);
    }
  },
};
