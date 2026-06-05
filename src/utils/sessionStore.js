'use strict';

const Session = require('../database/models/Session');
const logger  = require('./logger');

const SESSION_ID = process.env.SESSION_ID || 'prad-bot-session';

/**
 * Convertit Buffers et structures complexes en format sérialisables.
*/
function serializeSession(data) {
  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      // Buffer -> { _type: 'Buffer', data: base64 }
      if(Buffer.isBuffer(value) || (value && typeof value === 'object'  && value.type === 'Buffer')) {
        return {
          _type: 'Buffer',
          data: Buffer.from(value.data || value).toString('base64'),
        };
      }
      // Bigint -> string
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    })
  );
}

/**
 * Convertit les données sérialisées back to Buffer/Bigints.
 */
function deserializeSession(data) {
  return JSON.parse(JSON.stringify(data), (key, value) => {
    // { _type: 'Buffer', data: base64 } -> Buffer
    if (value && typeof value === 'object' && value._type === 'Buffer') {
      return Buffer.from(value.data, 'base64');
    }
    // Bigint strings -> bigint (si c'était stocké)
    if (typeof value === 'string' && /^\d+n$)/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return value;
  });
}

/**
 * Sauvegarde les credentials Baileys (creds + keys) dans MongoDB.
 */
async function saveSession(authState, phoneNumber = null) {
  try {
    if (!authState || !authState.creds) {
      logger.warn('⚠️ saveSession: authState.creds est vide, skipped');
      return;
    }

    const serialized = {
      creds: serializeSession(authState.creds),
      keys: authState.keys ? serializeSession(authState.keys) : {},
      phone: phoneNumber,
      status: 'connected',
      updatedAt: new Date(),
    };

    const result = await Session.findOneAndUpdate(
      { sessionId: SESSION_ID },
      { $set: serialized },
      { upsert: true, new: true }
    );

    logger.info(`✅ Session sauvegardée (ID: ${SESSION_ID}`);
    return result;
  } catch (err) {
    logger.error(`❌ saveSession error: ${err.message}`);
  }
}

/**
 * Charge les credentials depuis MongoDB.
 * Retourne un objet { creds, keys } ou null si aucune session sauvegardée.
 */
async function loadSession() {
  try {
    const doc = await Session.findOne({ sessionId: SESSION_ID });
    if (!doc) { 
      logger.info('ℹ️ Aucune session trouvée en MongoDB — nouveau QR requis')
      return null; 
    }

    // ✅ Reconvertir base64 → Buffer
    const raw = doc.toObject();
    const authState = {
      creds: deserializeSession(raw.creds || {}),
      keys: deserializeSession(raw.keys || {}),
    };

    logger.info(`✅ Session chargée depuis MongoDB (${raw.phone || 'unknown'})`);
    return authState;
  } catch (err) {
    logger.error(`❌ loadSession error:${err.message}`);
    return null;
  }
}

/**
 * Supprime la session (pour forcer un nouveau scan).
 */
async function deleteSession() {
  try {
    const result = await Session.deleteOne({ sessionId: SESSION_ID });
    if(result.deletedCount > 0) {
      logger.info('✅ Session supprimée — nouveau QR requis');
    } else {
      logger.warn('⚠️ Aucune session trouvée à supprimer');
    }
  } catch (err) {
    logger.error(`❌ deleteSession error: ${err.message}`);
  }
}

/**
 * Retourne le statut de la session (connectée ou non).
 */
async function getSessionStatus() {
  try {
    const doc = await Session.findOne({ sessionId: SESSION_ID });
    if(!doc) return 'no_session';
    return doc.status || 'unknown';
  } catch (err) {
    logger.error(`❌ getSessionStatus error: ${err.message}`);
    return 'error';
  }
}

/**
 * Met à jour le statut de la session.
 */
async function updateSessionStatus(status) {
  try {
    await Session.findOneAndUpdate(
      { sessionId: SESSION_ID },
      { $set: { status, updatedAt: new Date() }}
    );
  } catch (err) {
    logger.error(`❌ updateSessionStatus error: ${err.message}`);
  }
}

module.exports = { saveSession, loadSession, deleteSession, getSessionStatus, updateSessionStatus,};