'use strict';

const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const { paths } = require('../config/config');
const logger  = require('./logger');

if (!fs.existsSync(paths.temp)) fs.mkdirSync(paths.temp, { recursive: true });

// Detect and set ffmpeg path at module load
let ffmpegPath = null;
let ffprobePath = null;
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
  logger.info({ ffmpegPath }, 'ffmpeg path detected from @ffmpeg-installer/ffmpeg');
} catch (e) {
  logger.warn('ffmpeg not found via @ffmpeg-installer/ffmpeg, will try system ffmpeg');
}

// Try to detect ffprobe (used by ffmpeg.ffprobe). Optional dependency: @ffmpeg-installer/ffprobe
try {
  ffprobePath = require('@ffprobe-installer/ffprobe').path;
  logger.info({ ffprobePath }, 'ffprobe path detected from @ffprobe-installer/ffprobe');
} catch (e) {
  logger.warn('ffprobe not found via @ffprobe-installer/ffprobe; ffprobe-based checks will fail unless ffprobe is available on PATH');
}

function configureFfmpeg(ffmpeg) {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  if (ffprobePath) {
    try { ffmpeg.setFfprobePath(ffprobePath); } catch (_) {}
  }
}

/**
 * WebP animé si le fichier contient un chunk ANIM (ou ANMF).
 */
function isAnimatedWebp(buffer) {
  if (!buffer || buffer.length < 16) return false;
  // RIFF....WEBP
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return false;
  }
  // Cherche "ANIM" ou "ANMF" dans les premiers ~64 Ko
  const slice = buffer.subarray(0, Math.min(buffer.length, 65536));
  const str = slice.toString('binary');
  return str.includes('ANIM') || str.includes('ANMF');
}

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
    const WATCHDOG_MS = 120000; // 2 minutes watchdog
    let watchdog = null;

    const done = (val) => {
      if (resolved) return;
      resolved = true;
      if (watchdog) clearTimeout(watchdog);
      resolve(val);
    };

    const resetWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        logger.error('videoToSticker: ffmpeg watchdog timeout after 120s');
        done(null);
      }, WATCHDOG_MS);
    };

    try {
      const ffmpeg = require('fluent-ffmpeg');
      configureFfmpeg(ffmpeg);
      
      const id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const tmpIn  = path.join(paths.temp, `vin_${id}.mp4`);
      const tmpOut = path.join(paths.temp, `vout_${id}.webp`);
      
      fs.writeFileSync(tmpIn, buffer);
      resetWatchdog();
      
      // Pipeline fiable pour WebP animé WhatsApp :
      // - fps 15, max 30s, 512x512, loop infini, sans audio
      // - libwebp + yuva420p pour transparence éventuelle
      const run = (outPath, extraVf) => new Promise((res, rej) => {
        const vf = extraVf ||
          'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1';

        ffmpeg(tmpIn)
          .inputOptions(['-t', '30'])
          .outputOptions([
            '-y',
            '-vf', vf,
            '-vcodec', 'libwebp',
            '-lossless', '0',
            '-compression_level', '6',
            '-q:v', '60',
            '-loop', '0',
            '-an',
            '-vsync', '0',
            '-pix_fmt', 'yuva420p',
          ])
          .toFormat('webp')
          .on('start', (cmd) => {
            logger.info({ cmd }, 'videoToSticker: ffmpeg start');
            resetWatchdog();
          })
          .on('progress', () => resetWatchdog())
          .on('end', () => res())
          .on('error', (err) => rej(err))
          .save(outPath);
      });
      
      (async () => {
        try {
          await run(tmpOut);

          if (!fs.existsSync(tmpOut)) throw new Error('output missing');
          let result = fs.readFileSync(tmpOut);

          // Si pas animé → 2e essai avec filtre plus simple
          if (!isAnimatedWebp(result)) {
            logger.warn('videoToSticker: first pass not animated, fallback');
            const tmpOut2 = path.join(paths.temp, `vout2_${id}.webp`);
            try {
              await run(tmpOut2, 'fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos');
              if (fs.existsSync(tmpOut2)) {
                const alt = fs.readFileSync(tmpOut2);
                if (isAnimatedWebp(alt) || alt.length > result.length) result = alt;
                try { fs.unlinkSync(tmpOut2); } catch (_) {}
              }
            } catch (e) {
              logger.warn({ err: e.message }, 'videoToSticker: fallback failed');
            }
          }

          logger.info({
            size: result.length,
            animated: isAnimatedWebp(result),
          }, 'videoToSticker: done');

          try { fs.unlinkSync(tmpIn); } catch (_) {}
          try { fs.unlinkSync(tmpOut); } catch (_) {}
          done(result);
        } catch (err) {
          logger.error({ err: err && err.message, stderr: err && err.stderr }, 'videoToSticker: error');
          try { fs.unlinkSync(tmpIn); } catch (_) {}
          try { fs.unlinkSync(tmpOut); } catch (_) {}
          done(null);
        }
      })();
    } catch (err) {
      logger.error({ err: err && err.message }, 'videoToSticker: init failed');
      done(null);
    }
  });
}

/**
 * Sticker WebP animé → MP4 (pour unstick vidéo).
 */
async function stickerToVideo(buffer) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (v) => { if (!resolved) { resolved = true; resolve(v); } };

    try {
      const ffmpeg = require('fluent-ffmpeg');
      configureFfmpeg(ffmpeg);

      const id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const tmpIn  = path.join(paths.temp, `sin_${id}.webp`);
      const tmpOut = path.join(paths.temp, `sout_${id}.mp4`);

      fs.writeFileSync(tmpIn, buffer);

      ffmpeg(tmpIn)
        .outputOptions([
          '-y',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        ])
        .toFormat('mp4')
        .on('end', () => {
          try {
            const out = fs.readFileSync(tmpOut);
            try { fs.unlinkSync(tmpIn); } catch (_) {}
            try { fs.unlinkSync(tmpOut); } catch (_) {}
            done(out);
          } catch (e) {
            done(null);
          }
        })
        .on('error', (err) => {
          logger.error({ err: err && err.message }, 'stickerToVideo: error');
          try { fs.unlinkSync(tmpIn); } catch (_) {}
          try { fs.unlinkSync(tmpOut); } catch (_) {}
          done(null);
        })
        .save(tmpOut);
    } catch (err) {
      logger.error({ err: err && err.message }, 'stickerToVideo: init failed');
      done(null);
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
    iif (target[t]) {
      const raw = target[t];
      return {
        type: t.replace('Message', ''),
        raw,
        isAnimated: !!(raw.isAnimated || raw.gifPlayback),
      };
    }
  }
  return null;
}

module.exports = {
  imageToSticker,
  videoToSticker,
  stickerToVideo,
  isAnimatedWebp,
  downloadMedia,
  getMediaType,
};
