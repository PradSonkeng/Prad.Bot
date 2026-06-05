'use strict';

const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      default: 'main',
      unique: true,
      required: true,
    },
    creds: {
      type: Object,
      required: true,
    },
    keys: {
      type: Object,
      required: false,
    },
    phone: String,
    status: {
      type: String,
      enum: ['connected', 'disconnected', 'logged_out'],
      default: 'disconnected',
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 7776000,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index seulement ici, pas dans la classe
SessionSchema.index({ sessionId: 1 });
SessionSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Session', SessionSchema);
