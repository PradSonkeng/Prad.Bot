const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  jid:       { type: String, required: true, unique: true },
  pushName:  { type: String, default: '' },
  banned:    { type: Boolean, default: false },
  warns:     { type: Number,  default: 0 },
  lastSeen:  { type: Date,    default: Date.now },
  createdAt: { type: Date,    default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);