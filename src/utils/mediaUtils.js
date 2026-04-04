'use strict';

const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const { paths } = require('../config/config');

if (!fs.existsSync(paths.temp)) fs.mkdirSync(paths.temp, { recursive: true });

/**
 * Convertit une image en sticker WebP statique.
 */
async function imageToSticker(buffer) {
  return sharp(buffer)
    .resize(512, 512, {
      fit:        'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * Convertit une vidéo en sticker WebP animé via ffmpeg.
 * Retourne null si ffmpeg n'est pas disponible.
 */
async function videoToSticker(buffer) {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const logger = require('./logger');
        logger.error('videoToSticker: ffmpeg timeout after 30s');
        resolve(null);
      }
    }, 30000); // 30 second timeout

    try {
      const ffmpeg = require('fluent-ffmpeg');
      const logger = require('./logger');
      const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
      ffmpeg.setFfmpegPath(ffmpegPath);
      const tmpIn  = path.join(paths.temp, `in_${Date.now()}.mp4`);
      const tmpOut = path.join(paths.temp, `out_${Date.now()}.webp`);

      fs.writeFileSync(tmpIn, buffer);

      ffmpeg(tmpIn)
        .outputOptions([
          '-vcodec', 'libwebp',
          // Use fps and scaling, keep alpha, pad to 512x512
          '-vf',     'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0.0',
          // quality / compression options for animated webp
          '-lossless', '0',
          '-qscale', '75',
          '-compression_level', '6',
          '-pix_fmt', 'yuva420p',
          '-loop',   '0',
          '-preset', 'default',
          '-an',
          '-vsync', '0',
          '-t',     '00:00:07',  // max 7 secondes
        ])
        .toFormat('webp')
        .save(tmpOut)
        .on('start', (cmd) => {
          logger.debug('videoToSticker: ffmpeg process started');
        })
        .on('progress', (progress) => {
          logger.debug({ progress }, 'videoToSticker: ffmpeg progress');
        })
        .on('end', () => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;

          try {
            const result = fs.readFileSync(tmpOut);
            // Nettoyage
            try { fs.unlinkSync(tmpIn); } catch {}
            try { fs.unlinkSync(tmpOut); } catch {}
            logger.debug({ size: result.length }, 'videoToSticker: conversion succeeded');
            resolve(result);
          } catch (err) {
            logger.error({ err: err.message }, 'videoToSticker: failed to read output file');
            try { fs.unlinkSync(tmpIn); } catch {}
            try { fs.unlinkSync(tmpOut); } catch {}
            resolve(null);
          }
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;

          // ffmpeg non dispo ou erreur → on nettoie et retourne null
          logger.error({ err: err && err.message, stderr: err && err.stderr }, 'videoToSticker: ffmpeg error');
          try { fs.unlinkSync(tmpIn); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
          resolve(null);
        });
    } catch (err) {
      clearTimeout(timeout);
      if (resolved) return;
      resolved = true;

      const logger = require('./logger');
      logger.error({ err: err && err.message, stack: err && err.stack }, 'videoToSticker: initialization failed');
      resolve(null);
    }
  });
}

/**
 * Télécharge le buffer d'un message média.
 */
async function downloadMedia(sock, msg) {
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');
  return downloadMediaMessage(msg, 'buffer', {}, {
    logger:           require('./logger'),
    reuploadRequest:  sock.updateMediaMessage,
  });
}

/**
 * Détecte le type de média d'un message (y compris vue unique).
 */
function getMediaType(msg) {
  const types  = ['imageMessage','videoMessage','audioMessage',
                  'stickerMessage','documentMessage'];
  const msgObj = msg.message || {};

  const viewOnce =
    msgObj.viewOnceMessage?.message ||
    msgObj.viewOnceMessageV2?.message ||
    msgObj.viewOnceMessageV2Extension?.message;

  const target = viewOnce || msgObj;

  for (const t of types) {
    if (target[t]) return { type: t.replace('Message', ''), raw: target[t] };
  }
  return null;
}

module.exports = { imageToSticker, videoToSticker, downloadMedia, getMediaType };