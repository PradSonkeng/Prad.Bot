const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  groupId:  { type: String, required: true, unique: true },
  name:     { type: String, default: '' },
  admins:   [{ type: String }],           // JIDs des admins bot
  muted:    [{ type: String }],
  settings: {
    antiFlood: { type: Boolean, default: true },
    language:  { type: String,  default: 'fr' },
    announcement: { type: Boolean, default: false },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

GroupSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Group', GroupSchema);
