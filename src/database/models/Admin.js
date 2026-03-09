'use strict';

const mongoose = require('mongoose');

/**
 * Modèle Admin indépendant.
 * Gère les admins bot de façon granulaire, indépendamment des admins WhatsApp natifs.
 * Permet : permissions fines, historique, sanctions, niveaux d'accès.
 */

const PERMISSION_LEVELS = {
  SUPERADMIN: 3,  // Propriétaire du bot (OWNER)
  ADMIN:      2,  // Admin bot d'un groupe
  MODERATOR:  1,  // Modérateur (accès limité)
  MEMBER:     0,  // Membre simple
};

const AdminSchema = new mongoose.Schema({

  // ─── Identification ────────────────────────────────────────────────────────
  jid: {
    type:     String,
    required: true,
    index:    true,
    // Ex: "22901234567@s.whatsapp.net"
  },

  groupId: {
    type:    String,
    default: null,
    index:   true,
    // null = admin global (superadmin du bot)
    // "@g.us" = admin d'un groupe spécifique
  },

  // ─── Niveau d'accès ────────────────────────────────────────────────────────
  level: {
    type:    Number,
    default: PERMISSION_LEVELS.ADMIN,
    enum:    Object.values(PERMISSION_LEVELS),
  },

  role: {
    type:    String,
    default: 'admin',
    enum:    ['superadmin', 'admin', 'moderator'],
  },

  // ─── Permissions granulaires ───────────────────────────────────────────────
  permissions: {
    canPromote:    { type: Boolean, default: true  },  // ||upadmin
    canDemote:     { type: Boolean, default: true  },  // ||downadmin
    canKick:       { type: Boolean, default: true  },  // ||det
    canAdd:        { type: Boolean, default: true  },  // ||add
    canTagAll:     { type: Boolean, default: true  },  // ||all
    canBan:        { type: Boolean, default: false },  // Bannir un user
    canManageBot:  { type: Boolean, default: false },  // Config du bot
  },

  // ─── Traçabilité ───────────────────────────────────────────────────────────
  promotedBy: {
    type:    String,
    default: null,
    // JID de celui qui a promu cet admin
  },

  promotedAt: {
    type:    Date,
    default: Date.now,
  },

  demotedAt: {
    type:    Date,
    default: null,
  },

  isActive: {
    type:    Boolean,
    default: true,
    index:   true,
  },

  // ─── Sanctions / Avertissements ────────────────────────────────────────────
  warns: {
    type:    Number,
    default: 0,
    min:     0,
  },

  isSuspended: {
    type:    Boolean,
    default: false,
  },

  suspendedReason: {
    type:    String,
    default: null,
  },

  // ─── Historique des actions ────────────────────────────────────────────────
  actionLog: [
    {
      action:    { type: String  },          // 'promote', 'kick', 'ban', etc.
      targetJid: { type: String  },          // Cible de l'action
      groupId:   { type: String  },
      date:      { type: Date, default: Date.now },
      note:      { type: String, default: '' },
    },
  ],

  // ─── Timestamps ────────────────────────────────────────────────────────────
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ─── Index composé : un admin est unique par (jid + groupId) ─────────────────
AdminSchema.index({ jid: 1, groupId: 1 }, { unique: true });

// ─── Mise à jour automatique de updatedAt ────────────────────────────────────
AdminSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// MÉTHODES D'INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si cet admin a une permission spécifique.
 * @param {string} perm - Nom de la permission (ex: 'canKick')
 */
AdminSchema.methods.hasPermission = function (perm) {
  if (this.isSuspended) return false;
  if (this.level >= PERMISSION_LEVELS.SUPERADMIN) return true; // superadmin = tout
  return this.permissions[perm] === true;
};

/**
 * Ajoute une action dans le journal de cet admin.
 * @param {string} action
 * @param {string} targetJid
 * @param {string} groupId
 * @param {string} note
 */
AdminSchema.methods.logAction = async function (action, targetJid, groupId, note = '') {
  this.actionLog.push({ action, targetJid, groupId, note });
  // Garder seulement les 100 dernières actions
  if (this.actionLog.length > 100) {
    this.actionLog = this.actionLog.slice(-100);
  }
  await this.save();
};

/**
 * Suspend cet admin avec une raison.
 */
AdminSchema.methods.suspend = async function (reason = '') {
  this.isSuspended    = true;
  this.suspendedReason = reason;
  await this.save();
};

/**
 * Réactive un admin suspendu.
 */
AdminSchema.methods.unsuspend = async function () {
  this.isSuspended     = false;
  this.suspendedReason = null;
  await this.save();
};

// ═══════════════════════════════════════════════════════════════════════════════
// MÉTHODES STATIQUES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si un JID est admin (bot) dans un groupe donné.
 * @param {string} jid
 * @param {string} groupId
 * @returns {Promise<Admin|null>}
 */
AdminSchema.statics.isAdmin = async function (jid, groupId) {
  return this.findOne({
    jid,
    groupId,
    isActive:    true,
    isSuspended: false,
  });
};

/**
 * Récupère tous les admins actifs d'un groupe.
 * @param {string} groupId
 */
AdminSchema.statics.getGroupAdmins = async function (groupId) {
  return this.find({
    groupId,
    isActive:    true,
    isSuspended: false,
  }).sort({ level: -1 });
};

/**
 * Promeut un membre au rang d'admin bot dans un groupe.
 * @param {string} jid         - JID de la cible
 * @param {string} groupId     - JID du groupe
 * @param {string} promotedBy  - JID du promoteur
 * @param {string} role        - 'admin' | 'moderator'
 */
AdminSchema.statics.promote = async function (jid, groupId, promotedBy, role = 'admin') {
  return this.findOneAndUpdate(
    { jid, groupId },
    {
      $set: {
        isActive:    true,
        isSuspended: false,
        role,
        level:       role === 'admin' ? PERMISSION_LEVELS.ADMIN : PERMISSION_LEVELS.MODERATOR,
        promotedBy,
        promotedAt:  Date.now(),
        demotedAt:   null,
        updatedAt:   Date.now(),
      },
    },
    { upsert: true, new: true }
  );
};

/**
 * Destituie un admin bot dans un groupe.
 * @param {string} jid
 * @param {string} groupId
 */
AdminSchema.statics.demote = async function (jid, groupId) {
  return this.findOneAndUpdate(
    { jid, groupId },
    {
      $set: {
        isActive:  false,
        role:      'member',
        level:     PERMISSION_LEVELS.MEMBER,
        demotedAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
    { new: true }
  );
};

/**
 * Retourne les statistiques d'un admin (nombre d'actions par type).
 * @param {string} jid
 * @param {string} groupId
 */
AdminSchema.statics.getStats = async function (jid, groupId) {
  const admin = await this.findOne({ jid, groupId });
  if (!admin) return null;

  const stats = {};
  for (const log of admin.actionLog) {
    stats[log.action] = (stats[log.action] || 0) + 1;
  }
  return {
    jid,
    groupId,
    role:        admin.role,
    level:       admin.level,
    totalActions: admin.actionLog.length,
    byAction:    stats,
    warns:       admin.warns,
    isSuspended: admin.isSuspended,
    promotedAt:  admin.promotedAt,
  };
}

// ═══════════════════════════════════════════════════════
// EXPORT — TOUJOURS EN DERNIER
// ═══════════════════════════════════════════════════════
const Admin = mongoose.model('Admin', AdminSchema);
Admin.PERMISSION_LEVELS = {
  SUPERADMIN: 3,
  ADMIN:      2,
  MODERATOR:  1,
  MEMBER:     0,
};
module.exports = Admin;