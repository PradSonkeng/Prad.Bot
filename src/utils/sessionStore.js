'use strict';

const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const Session = require('../database/models/Session');
const logger  = require('./logger');

const SESSION_ID = process.env.SESSION_ID || 'prad-bot-session';

/**
 * Sérialise correctement les Buffers pour MongoDB
 */
function serialize(data) {
  return JSON.parse(JSON.stringify(data, BufferJSON.replacer));
}
/**
 * Désérialise les Buffers depuis MongoDB
 */
function deserialize(data) {
  return JSON.parse(JSON.stringify(data), BufferJSON.reviver);
}

/**
 * Charge ou crée l'état d'authentification Baileys depuis MongoDB.
 * Retourne { state, saveCreds } compatible avec makeWASocket.
 */
async function useMongoAuthState() {
  let doc = await Session.findOne({ sessionId: SESSION_ID });

  let creds;
  let keys = {};

  if (doc?.data?.creds) {
    const data = deserialize(doc.data);
    creds = data.creds;
    keys  = data.keys || {};
    logger.info('✅ Session complète chargée depuis MongoDB');
  } else {
    creds = initAuthCreds();
    logger.info('🆕 Nouvelle session créée (aucun historique trouvé)');
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
            if (value) {
              keys[key] = value;
            } else {
              delete keys[key];
            }
          }
        }
        // Sauvegarde immédiate des keys
        await persist();
      },
    },
  };

  async function persist() {
    try {
      const payload = serialize({ creds: state.creds, keys });
      await Session.findOneAndUpdate(
        { sessionId: SESSION_ID },
        { $set: { data: payload, updatedAt: Date.now() } },
        { upsert: true }
      );
    } catch (err) {
      logger.error('persist session error: ' + err.message);
    }
  }

  // saveCreds est appelé par Baileys à chaque mise à jour des credentials
  const saveCreds = async () => {
    await persist();
  };

  return { state, saveCreds };
}
 
 
/**
 * Supprime complètement la session (force un nouveau QR / pairing)
 */
async function deleteSession() {
  try {
    await Session.deleteOne({ sessionId: SESSION_ID });
    logger.info('🗑️  Session MongoDB supprimée — nouveau scan requis');
  } catch (err) {
    logger.error('deleteSession error: ' + err.message);
  }
}

/**
 * Vérifie si une session existe déjà
 */
async function hasSession() {
  const doc = await Session.findOne({ sessionId: SESSION_ID }).select('_id').lean();
  return !!doc;
}

module.exports = {
  useMongoAuthState,
  deleteSession,
  hasSession,
};
