'use strict';

/**
 * Auth State MongoDB multi-sessions.
 * Chaque sessionId a ses propres creds + keys Signal.
 */

const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const Session = require('../database/models/Session');
const logger  = require('./logger');

function serialize(data) {
  return JSON.parse(JSON.stringify(data, BufferJSON.replacer));
}

function deserialize(data) {
  return JSON.parse(JSON.stringify(data), BufferJSON.reviver);
}

/**
 * Auth state Baileys pour une session donnée.
 * @param {string} sessionId
 */
async function useMongoAuthState(sessionId) {
  let doc = await Session.findOne({ sessionId });

  let creds;
  let keys = {};

  if (doc?.data?.creds) {
    const parsed = deserialize(doc.data);
    creds = parsed.creds;
    keys  = parsed.keys || {};
    logger.info(`[${sessionId}] Session chargée depuis MongoDB`);
  } else {
    creds = initAuthCreds();
    if (!doc) {
      await Session.create({
        sessionId,
        type: sessionId === (process.env.SESSION_ID || 'prad-bot-main') ? 'main' : 'user',
        data: null,
        registered: false,
      });
    }
    logger.info(`[${sessionId}] Nouvelle session créée`);
  }

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const result = {};
        for (const id of ids) {
          let value = keys[`${type}-${id}`];
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          result[id] = value;
        }
        return result;
      },
      set: async (data) => {
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            const key = `${category}-${id}`;
            if (value) keys[key] = value;
            else delete keys[key];
          }
        }
        await persist();
      },
    },
  };

  async function persist() {
    try {
      const payload = serialize({ creds: state.creds, keys });
      await Session.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            data: payload,
            registered: !!state.creds?.registered,
            updatedAt: Date.now(),
            lastSeen: Date.now(),
          },
        },
        { upsert: true }
      );
    } catch (err) {
      logger.error(`[${sessionId}] persist error: ` + err.message);
    }
  }

  const saveCreds = async () => persist();

  return { state, saveCreds };
}

async function deleteSession(sessionId) {
  try {
    await Session.deleteOne({ sessionId });
    logger.info(`[${sessionId}] Session supprimée`);
  } catch (err) {
    logger.error(`[${sessionId}] deleteSession error: ` + err.message);
  }
}

async function hasSession(sessionId) {
  const doc = await Session.findOne({ sessionId }).select('_id registered').lean();
  return !!doc;
}

async function listSessions(filter = {}) {
  return Session.find(filter).select('-data').lean();
}

async function updateSessionMeta(sessionId, meta) {
  await Session.findOneAndUpdate(
    { sessionId },
    { $set: { ...meta, updatedAt: Date.now(), lastSeen: Date.now() } }
  );
}

async function getSession(sessionId) {
  return Session.findOne({ sessionId }).select('-data').lean();
}

module.exports = {
  useMongoAuthState,
  deleteSession,
  hasSession,
  listSessions,
  updateSessionMeta,
  getSession,
};
