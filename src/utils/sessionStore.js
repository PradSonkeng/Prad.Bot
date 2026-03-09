'use strict';

const Session = require('../database/models/Session');
const logger  = require('./logger');

/**
 * Sauvegarde les credentials Baileys dans MongoDB.
 */
async function saveSession(creds) {
  try {
    await Session.findOneAndUpdate(
      { sessionId: 'main' },
      { $set: { data: creds, updatedAt: Date.now() } },
      { upsert: true }
    );
  } catch (err) {
    logger.error('saveSession error: ' + err.message);
  }
}

// Convertit les Binary MongoDB en Buffer Node.js
function convertBinaryToBuffer(obj) {
  if (obj === null || obj === undefined) return obj;

  // MongoDB Binary → Buffer
  if (obj._bsontype === 'Binary' || (obj.buffer && obj.sub_type !== undefined)) {
    return Buffer.from(obj.buffer || obj.value());
  }

  if (Buffer.isBuffer(obj)) return obj;

  if (typeof obj === 'string') return obj;

  if (Array.isArray(obj)) {
    return obj.map(convertBinaryToBuffer);
  }

  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = convertBinaryToBuffer(obj[key]);
    }
    return result;
  }

  return obj;
}

async function loadSession() {
  try {
    const doc = await Session.findOne({ sessionId: SESSION_ID });
    if (!doc) return null;

    // ✅ Conversion critique : Binary MongoDB → Buffer Node.js
    const raw  = doc.toObject();
    const data = convertBinaryToBuffer(raw.data);

    logger.info('✅ Session chargée depuis MongoDB');
    return data;
  } catch (err) {
    logger.error('Erreur chargement session : ' + err.message);
    return null;
  }
}

/**
 * Supprime la session (pour forcer un nouveau scan).
 */
async function deleteSession() {
  try {
    await Session.deleteOne({ sessionId: 'main' });
    logger.info('Session supprimée.');
  } catch (err) {
    logger.error('deleteSession error: ' + err.message);
  }
}

module.exports = { saveSession, loadSession, deleteSession };