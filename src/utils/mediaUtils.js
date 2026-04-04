'use strict';

const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const { paths } = require('../config/config');
const logger  = require('./logger');

if (!fs.existsSync(paths.temp)) fs.mkdirSync(paths.temp, { recursive: true });

// Detect and set ffmpeg path at module load
let ffmpegPath = null;
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
  logger.info({ ffmpegPath }, 'ffmpeg path detected from @ffmpeg-installer/ffmpeg');
} catch (e) {
  logger.warn('ffmpeg not found via @ffmpeg-installer/ffmpeg, will try system ffmpeg');
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

    function setWatchdog() {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const logger = require('./logger');
          logger.error('videoToSticker: ffmpeg watchdog timeout after 120s');
          resolve(null);
        }
      }, WATCHDOG_MS);
    }

    try {
      const ffmpeg = require('fluent-ffmpeg');
      const logger = require('./logger');
      
      // Use detected ffmpeg path or let fluent-ffmpeg find it
      if (ffmpegPath) {
        logger.info({ ffmpegPath }, 'setting ffmpeg path');
        ffmpeg.setFfmpegPath(ffmpegPath);
      } else {
        logger.warn('no ffmpeg path configured, using system PATH');
      }

      const tmpIn  = path.join(paths.temp, `in_${Date.now()}.mp4`);
      const tmpOut = path.join(paths.temp, `out_${Date.now()}.webp`);

      logger.info({ tmpIn, tmpOut }, 'videoToSticker: writing input file');
      fs.writeFileSync(tmpIn, buffer);

      logger.info({ tmpIn, tmpOut }, 'videoToSticker: starting ffmpeg conversion');

      // prime watchdog before starting
      setWatchdog();

      ffmpeg(tmpIn)
        .outputOptions([
          '-y',  // Overwrite output file without asking
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
        .on('codecData', (data) => {
          logger.info({ codecData: data }, 'videoToSticker: codec data received');
          setWatchdog();
        })
        .toFormat('webp')
        .save(tmpOut)
        .on('start', (cmd) => {
          logger.info({ cmd }, 'videoToSticker: ffmpeg process started');
          setWatchdog();
        })
        .on('progress', (progress) => {
          logger.info({ 
            frames: progress.frames,
            currentFps: progress.currentFps,
            currentKbps: progress.currentKbps,
            targetSize: progress.targetSize,
            timemark: progress.timemark
          }, 'videoToSticker: ffmpeg progress');
          // reset watchdog on progress so we only time out on stalls
          setWatchdog();
        })
        .on('end', () => {
          if (watchdog) clearTimeout(watchdog);
          if (resolved) return;
          resolved = true;

          (async () => {
            try {
              if (!fs.existsSync(tmpOut)) throw new Error('output file not created');
              const result = fs.readFileSync(tmpOut);
              logger.info({ size: result.length }, 'videoToSticker: conversion succeeded');

              // Probe output to confirm animation (multiple frames)
              try {
                const probeInfo = await new Promise((res, rej) => ffmpeg.ffprobe(tmpOut, (e, i) => e ? rej(e) : res(i)));
                logger.info({ probe: probeInfo }, 'videoToSticker: ffprobe result');
                const vstream = (probeInfo.streams || []).find(s => s.codec_type === 'video');
                const nbFrames = vstream && (vstream.nb_frames || vstream.nb_read_frames);
                let framesEstimate = nbFrames;
                if (!framesEstimate && vstream && vstream.duration && vstream.avg_frame_rate) {
                  const parts = vstream.avg_frame_rate.split('/');
                  const fps = Number(parts[0]) / Number(parts[1] || 1) || 0;
                  framesEstimate = Math.round(fps * Number(vstream.duration));
                }
                logger.info({ nbFrames: framesEstimate }, 'videoToSticker: frame estimate');

                if (framesEstimate && Number(framesEstimate) <= 1) {
                  logger.warn('videoToSticker: output appears single-frame, attempting fallback re-encode');
                  const tmpOut2 = tmpOut + '.alt';
                  await new Promise((res, rej) => {
                    ffmpeg(tmpIn)
                      .outputOptions([
                        '-y',
                        '-vcodec', 'libwebp',
                        '-filter_complex', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease',
                        '-lossless', '0',
                        '-qscale', '75',
                        '-compression_level', '6',
                        '-pix_fmt', 'yuva420p',
                        '-loop', '0',
                        '-preset', 'default',
                        '-an',
                        '-vsync', '0',
                        '-t', '00:00:07'
                      ])
                      .toFormat('webp')
                      .save(tmpOut2)
                      .on('end', () => res())
                      .on('error', (e) => rej(e));
                  });
                  if (fs.existsSync(tmpOut2)) {
                    const alt = fs.readFileSync(tmpOut2);
                    logger.info({ size: alt.length }, 'videoToSticker: fallback conversion succeeded');
                    try { fs.unlinkSync(tmpIn); } catch {}
                    try { fs.unlinkSync(tmpOut); } catch {}
                    try { fs.unlinkSync(tmpOut2); } catch {}
                    resolve(alt);
                    return;
                  }
                }
              } catch (probeException) {
                logger.warn({ err: probeException && probeException.message }, 'videoToSticker: probe exception');
              }

              // Nettoyage (default path)
              try { fs.unlinkSync(tmpIn); } catch {}
              try { fs.unlinkSync(tmpOut); } catch {}
              resolve(result);
            } catch (err) {
              logger.error({ err: err.message, tmpOut }, 'videoToSticker: failed to read output file');
              try { fs.unlinkSync(tmpIn); } catch {}
              try { fs.unlinkSync(tmpOut); } catch {}
              resolve(null);
            }
          })();
        })
        .on('error', (err) => {
          if (watchdog) clearTimeout(watchdog);
          if (resolved) return;
          resolved = true;

          // ffmpeg non dispo ou erreur → on nettoie et retourne null
          logger.error({ 
            err: err && err.message, 
            stderr: err && err.stderr,
            code: err && err.code
          }, 'videoToSticker: ffmpeg error');
          try { fs.unlinkSync(tmpIn); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
          resolve(null);
        });
    } catch (err) {
      if (watchdog) clearTimeout(watchdog);
      if (resolved) return;
      resolved = true;

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