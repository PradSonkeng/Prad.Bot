'use strict';

/**
 * Extraction discrète des vues uniques par réaction emoji.
 *
 * Fonctionnement :
 * 1. Les messages (surtout vues uniques) sont mis en cache.
 * 2. Si quelqu'un réagit avec l'emoji configuré (défaut: 📥),
 *    le média est téléchargé et renvoyé UNIQUEMENT en privé
 *    à la personne qui a réagi — aucun message dans le chat d'origine.
 */

const logger = require('../utils/logger');
const { downloadMedia, getMediaType } = require('../utils/mediaUtils');

// Emoji déclencheur (changeable via .env VIEW_ONCE_EMOJI)
const TRIGGER_EMOJI = process.env.VIEW_ONCE_EMOJI || '📥';

// Cache des messages récents (clé = remoteJid + messageId)
const CACHE_MAX = 500;
const messageCache = new Map();

function cacheKey(key) {
  if (!key) return null;
  return (key.remoteJid || '') + '_' + (key.id || '');
}

function putCache(msg) {
  try {
    if (!msg?.key?.id) return;
    const k = cacheKey(msg.key);
    if (!k) return;

    const m = msg.message;
    if (!m) return;

    const hasMedia =
      m.imageMessage ||
      m.videoMessage ||
      m.audioMessage ||
      m.stickerMessage ||
      m.documentMessage ||
      m.viewOnceMessage ||
      m.viewOnceMessageV2 ||
      m.viewOnceMessageV2Extension ||
      m.ephemeralMessage;

    if (!hasMedia) return;

    messageCache.set(k, msg);

    if (messageCache.size > CACHE_MAX) {
      const first = messageCache.keys().next().value;
      messageCache.delete(first);
    }
  } catch (_) {}
}

function getCached(key) {
  return messageCache.get(cacheKey(key)) || null;
}

function unwrapMessage(msg) {
  if (!msg?.message) return msg;
  let m = msg.message;

  if (m.ephemeralMessage?.message) {
    m = m.ephemeralMessage.message;
  }
  if (m.viewOnceMessage?.message) {
    m = m.viewOnceMessage.message;
  } else if (m.viewOnceMessageV2?.message) {
    m = m.viewOnceMessageV2.message;
  } else if (m.viewOnceMessageV2Extension?.message) {
    m = m.viewOnceMessageV2Extension.message;
  }

  return { ...msg, message: m };
}

function isViewOnce(msg) {
  const m = msg?.message;
  if (!m) return false;
  return !!(
    m.viewOnceMessage ||
    m.viewOnceMessageV2 ||
    m.viewOnceMessageV2Extension ||
    m.imageMessage?.viewOnce ||
    m.videoMessage?.viewOnce ||
    m.audioMessage?.viewOnce
  );
}

function normalizeEmoji(text) {
  if (!text) return '';
  return String(text).replace(/\uFE0F/g, '').trim();
}

/**
 * Enregistre les listeners sur une socket (main ou user).
 */
function registerViewOnceReact(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      putCache(msg);

      const react = msg.message?.reactionMessage;
      if (react) {
        try {
          await handleReaction(sock, {
            key: react.key,
            reaction: {
              text: react.text,
              key: msg.key,
            },
          });
        } catch (err) {
          logger.error('[viewOnceReact upsert] ' + err.message);
        }
      }
    }
  });

  sock.ev.on('messages.reaction', async (reactions) => {
    for (const item of reactions) {
      try {
        await handleReaction(sock, item);
      } catch (err) {
        logger.error('[viewOnceReact] ' + err.message);
      }
    }
  });

  logger.info('viewOnceReact: emoji déclencheur = ' + TRIGGER_EMOJI);
}

async function handleReaction(sock, item) {
  const key = item.key;
  const reaction = item.reaction || item;

  const emoji = normalizeEmoji(
    reaction.text || reaction.emoji || (typeof reaction === 'string' ? reaction : '')
  );

  if (!emoji || reaction.text === '') return;

  const trigger = normalizeEmoji(TRIGGER_EMOJI);
  if (emoji !== trigger) return;

  if (!key?.id) return;

  const reactorJid =
    reaction.key?.participant ||
    reaction.key?.remoteJid ||
    key.participant ||
    null;

  let privateJid =
    item.reaction?.key?.participant ||
    item.key?.participant ||
    reactorJid;

  if (!privateJid && item.reactions?.[0]) {
    privateJid = item.reactions[0].key?.participant;
  }

  if (!privateJid) {
    if (key.fromMe || reaction.key?.fromMe) {
      privateJid = sock.user?.id;
    }
  }

  if (!privateJid) {
    logger.warn('[viewOnceReact] réacteur inconnu — ignore');
    return;
  }

  privateJid = privateJid.replace(/:\d+@/, '@');

  const cached = getCached(key);
  if (!cached) {
    logger.info('[viewOnceReact] message non trouvé en cache');
    return;
  }

  const unwrapped = unwrapMessage(cached);
  const mediaInfo = getMediaType(unwrapped);

  if (!mediaInfo && !isViewOnce(cached)) {
    return;
  }

  if (!mediaInfo) {
    return;
  }

  const buffer = await downloadMedia(sock, unwrapped);
  if (!buffer) return;

  switch (mediaInfo.type) {
    case 'image':
      await sock.sendMessage(privateJid, { image: buffer, caption: '' });
      break;
    case 'video':
      await sock.sendMessage(privateJid, { video: buffer, caption: '' });
      break;
    case 'audio':
      await sock.sendMessage(privateJid, {
        audio: buffer,
        ptt: !!unwrapped.message?.audioMessage?.ptt,
      });
      break;
    case 'sticker':
      await sock.sendMessage(privateJid, { sticker: buffer });
      break;
    case 'document':
      await sock.sendMessage(privateJid, {
        document: buffer,
        mimetype: mediaInfo.raw?.mimetype || 'application/octet-stream',
        fileName: mediaInfo.raw?.fileName || 'fichier',
      });
      break;
    default:
      return;
  }

  logger.info('[viewOnceReact] média envoyé en privé à ' + privateJid);
  console.log('[viewOnceReact] OK → ' + privateJid);
}

module.exports = {
  registerViewOnceReact,
  TRIGGER_EMOJI,
  putCache,
};
