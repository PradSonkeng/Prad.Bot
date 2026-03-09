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

/**
 * Charge les credentials depuis MongoDB.
 * Retourne null si aucune session sauvegardée.
 */
async function loadSession() {
  try {
    const doc = await Session.findOne({ sessionId: 'main' });
    return doc ? doc.data : null;
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
    await Session.deleteOne({ sessionId: 'main' });
    logger.info('Session supprimée.');
  } catch (err) {
    logger.error('deleteSession error: ' + err.message);
  }
}

module.exports = { saveSession, loadSession, deleteSession };