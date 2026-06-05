'use strict';

const { type } = require('express/lib/response');
const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  sessionId: { 
    type: String, 
    default: 'main', 
    unique: true,
    index: true,
    required: true,
  },
      // ✅ Sauvegarder creds + keys (complets)
  creds:     {
     type: Object,
     required: true
  },
  keys: {
      type: Object,
      required: false,
  },
  //Métadonnées
  phone: String,
  status: {
    type: String,
    enum: ['connected', 'disconnected', 'logged_out'],
    default: 'disconnected'
  },
  createdAt: { 
    type: Date,
    default: Date.now,
    expires: 7776000,  // Auto-delete après 90 jours
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  },
  {timestamps: true}
);

// Index pour les requetes rapides
SessionSchema.index({sessionId: 1});
SessionSchema.index({updatedAt: -1});

module.exports = mongoose.model('Session', SessionSchema);