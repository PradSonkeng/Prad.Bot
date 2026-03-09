'use strict';

const Admin  = require('../database/models/Admin');
const logger = require('../utils/logger');

/**
 * Nettoie un JID : supprime le :XX avant @
 * ex: "196211957055694:2@lid" → "196211957055694@lid"
 */
function cleanJid(jid) {
  if (!jid) return '';
  return jid.replace(/:\d+@/, '@');
}

async function isGroupAdmin(sock, jid, groupId) {
  try {
    const meta     = await sock.groupMetadata(groupId);
    const cleanJid_ = cleanJid(jid);

    const waAdmins = meta.participants.filter(
      p => p.admin === 'admin' || p.admin === 'superadmin'
    );

    for (const admin of waAdmins) {
      if (
        cleanJid(admin.id)  === cleanJid_ ||
        cleanJid(admin.lid) === cleanJid_ ||
        cleanJid(admin.jid) === cleanJid_
      ) return true;
    }

    const adminDoc = await Admin.isAdmin(jid, groupId);
    return !!adminDoc;

  } catch (err) {
    logger.warn('isGroupAdmin error: ' + err.message);
    return false;
  }
}

async function isBotAdmin(sock, groupId) {
  try {
    const meta       = await sock.groupMetadata(groupId);
    const botLidClean = cleanJid(sock.user.lid);  // "196211957055694@lid"
    const botJidClean = cleanJid(sock.user.id);   // "237672039320@s.whatsapp.net"

    const botParticipant = meta.participants.find(p =>
      cleanJid(p.id)  === botLidClean ||
      cleanJid(p.lid) === botLidClean ||
      cleanJid(p.id)  === botJidClean ||
      cleanJid(p.jid) === botJidClean
    );

    if (!botParticipant) {
      logger.warn('isBotAdmin: bot non trouvé dans les participants');
      return false;
    }

    const isAdmin = botParticipant.admin === 'admin' ||
                    botParticipant.admin === 'superadmin';

    logger.info('isBotAdmin: ' + botParticipant.id + ' → admin=' + isAdmin);
    return isAdmin;

  } catch (err) {
    logger.warn('isBotAdmin error: ' + err.message);
    return false;
  }
}

async function hasPermission(jid, groupId, permission) {
  try {
    const admin = await Admin.isAdmin(jid, groupId);
    if (!admin) return false;
    return admin.hasPermission(permission);
  } catch {
    return false;
  }
}

module.exports = { isGroupAdmin, isBotAdmin, hasPermission };