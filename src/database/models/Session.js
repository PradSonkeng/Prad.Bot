'use strict';

const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // 'main' = numéro du bot | 'user' = compte utilisateur lambda
  type: {
    type: String,
    enum: ['main', 'user'],
    default: 'user',
  },
  // Numéro E.164 sans + (ex: 237612345678) une fois connecté
  phone: {
    type: String,
    default: null,
    index: true,
  },
  // Nom d'affichage WhatsApp
  pushName: {
    type: String,
    default: null,
  },
  // Credentials + keys Baileys
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  // true si le compte a terminé le pairing
  registered: {
    type: Boolean,
    default: false,
  },
  // Actif / désactivé par l'owner
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastSeen:  { type: Date, default: Date.now },
}, {
  versionKey: false,
});

SessionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Session', SessionSchema);
