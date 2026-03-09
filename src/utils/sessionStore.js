'use strict';
const Session    = require('../database/models/Session');
const logger     = require('./logger');
const SESSION_ID = process.env.SESSION_ID || 'prad-bot-session';

async function saveSession(creds) {
  try {
    await Session.findOneAndUpdate(
      { sessionId: SESSION_ID },          // ✅ était 'main'
      { $set: { data: creds, updatedAt: Date.now() } },
      { upsert: true }
    );
  } catch (err) {
    logger.error('saveSession error: ' + err.message);
  }
}

function convertBinaryToBuffer(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj._bsontype === 'Binary' || (obj.buffer && obj.sub_type !== undefined)) {
    return Buffer.from(obj.buffer || obj.value());
  }
  if (Buffer.isBuffer(obj)) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(convertBinaryToBuffer);
  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) result[key] = convertBinaryToBuffer(obj[key]);
    return result;
  }
  return obj;
}

async function loadSession() {
  try {
    const doc = await Session.findOne({ sessionId: SESSION_ID });
    if (!doc) return null;
    const raw  = doc.toObject();
    const data = convertBinaryToBuffer(raw.data);
    logger.info('✅ Session chargée depuis MongoDB');
    return data;
  } catch (err) {
    logger.error('Erreur chargement session : ' + err.message);
    return null;
  }
}

async function deleteSession() {
  try {
    await Session.deleteOne({ sessionId: SESSION_ID }); // ✅ était 'main'
    logger.info('Session supprimée.');
  } catch (err) {
    logger.error('deleteSession error: ' + err.message);
  }
}

module.exports = { saveSession, loadSession, deleteSession };