'use strict';

const { isGroupAdmin, isBotAdmin } = require('../../middlewares/adminCheck');
const { sendText } = require('../../utils/messageUtils');
const Group = require('../../database/models/Group');

module.exports = {
  name: 'ouvrir',
  aliases: ['open', 'unlock', 'ouvrirgroupe'],
  description: 'Ouvre le groupe — tout le monde peut écrire',
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
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await Group.findOneAndUpdate(
        { groupId: jid },
        { $set: { 'settings.announcement': false, updatedAt: Date.now() } },
        { upsert: true }
      );
      await sendText(sock, jid, '🔓 *Groupe ouvert*\nTous les membres peuvent envoyer des messages.');
    } catch (err) {
      await sendText(sock, jid, '❌ Impossible d\'ouvrir le groupe : ' + err.message);
    }
  },
};
