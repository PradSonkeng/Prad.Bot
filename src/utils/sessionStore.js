'use strict';

const Session = require('../database/models/Session');
const logger  = require('./logger');

/**
 * Sauvegarde les credentials Baileys dans MongoDB.
 */
async function saveSession(creds) {
  try {
    // ✅ Convertir tous les Buffers en base64 avant MongoDB
    const serialized = JSON.parse(JSON.stringify(creds, (key, value) => {
      if (value instanceof Buffer || value?.type === 'Buffer') {
        return { _type: 'Buffer', data: Buffer.from(value.data || value).toString('base64') };
      }
      return value;
    }));

    await Session.findOneAndUpdate(
      { sessionId: SESSION_ID },
      { $set: { data: serialized, updatedAt: Date.now() } },
      { upsert: true }
    );
  } catch (err) {
    logger.error('saveSession error: ' + err.message);
  }
}

/**
 * Charge les credentials depuis MongoDB.
 * Retourne null si aucune session sauvegardée.
 */
async function loadSession() {
  try {
    const doc = await Session.findOne({ sessionId: SESSION_ID });
    if (!doc) return null;

    // ✅ Reconvertir base64 → Buffer
    const raw = doc.toObject();
    const data = JSON.parse(JSON.stringify(raw.data), (key, value) => {
      if (value && value._type === 'Buffer') {
        return Buffer.from(value.data, 'base64');
      }
      return value;
    });

    logger.info('✅ Session chargée depuis MongoDB');
    return data;
  } catch (err) {
    logger.error('loadSession error: ' + err.message);
    return null;
  }
}

/**
 * Supprime la session (pour forcer un nouveau scan).
 */
async function deleteSession() {
  try {
    await Session.deleteOne({ sessionId: SESSION_ID });
    logger.info('Session supprimée.');
  } catch (err) {
    logger.error('deleteSession error: ' + err.message);
  }
}

module.exports = { saveSession, loadSession, deleteSession };