'use strict';

const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, default: 'main', unique: true },
  data:      { type: Object, required: true },
  updatedAt: { type: Date,   default: Date.now },
});

module.exports = mongoose.model('Session', SessionSchema);