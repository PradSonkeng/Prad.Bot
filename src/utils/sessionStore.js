'use strict';

const Session = require('../database/models/Session');
const logger = require('./logger');

const SESSION_ID = process.env.SESSION_ID || 'prad-bot-session';

function serializeSession(data) {
  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (Buffer.isBuffer(value) || (value && typeof value === 'object' && value.type === 'Buffer')) {
        return {
          _type: 'Buffer',
          data: Buffer.from(value.data || value).toString('base64'),
        };
      }
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    })
  );
}

function deserializeSession(data) {
  return JSON.parse(JSON.stringify(data), (key, value) => {
    if (value && typeof value === 'object' && value._type === 'Buffer') {
      return Buffer.from(value.data, 'base64');
    }
    if (typeof value === 'string' && /^\d+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return value;
  });
}

async function saveSession(authState, phoneNumber = null) {
  try {
    if (!authState || !authState.creds) {
      logger.warn('⚠️ saveSession: authState vide');
      return;
    }

    const serialized = {
      creds: serializeSession(authState.creds),
      keys: authState.keys ? serializeSession(authState.keys) : {},
      phone: phoneNumber,
      status: 'connected',
      updatedAt: new Date(),
    };

    await Session.findOneAndUpdate(
      { sessionId: SESSION_ID },
      { $set: serialized },
      { upsert: true }
    );

    logger.info(`✅ Session sauvegardée`);
  } catch (err) {
    logger.error(`❌ saveSession: ${err.message}`);
  }
}

async function loadSession() {
  try {
    const doc = await Session.findOne({ sessionId: SESSION_ID });
    if (!doc) {
      logger.info('ℹ️ Aucune session — nouveau QR');
      return null;
    }

    const raw = doc.toObject();
    const authState = {
      creds: deserializeSession(raw.creds || {}),
      keys: deserializeSession(raw.keys || {}),
    };

    logger.info(`✅ Session chargée (${raw.phone || 'unknown'})`);
    return authState;
  } catch (err) {
    logger.error(`❌ loadSession: ${err.message}`);
    return null;
  }
}

async function deleteSession() {
  try {
    const result = await Session.deleteOne({ sessionId: SESSION_ID });
    if (result.deletedCount > 0) {
      logger.info('✅ Session supprimée');
    }
  } catch (err) {
    logger.error(`❌ deleteSession: ${err.message}`);
  }
}

async function updateSessionStatus(status) {
  try {
    await Session.findOneAndUpdate(
      { sessionId: SESSION_ID },
      { $set: { status, updatedAt: new Date() } }
    );
  } catch (err) {
    logger.error(`❌ updateSessionStatus: ${err.message}`);
  }
}

module.exports = {
  saveSession,
  loadSession,
  deleteSession,
  updateSessionStatus,
};
