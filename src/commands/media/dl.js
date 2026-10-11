 'use strict';
 const { sendText } = require('../../utils/messageUtils');
 const axios        = require('axios');
 const fs           = require('fs');
 const path         = require('path');
 const { paths }    = require('../../config/config');
 const logger       = require('../../utils/logger');
 const fsPromises   = require('fs').promises;
 const glob         = require('glob');
 const { spawn }    = require('child_process');

 const MAX_SIZE = 60 * 1024 * 1024; // 60 MB


 // Envoie une vidéo WhatsApp avec le bon mimetype (évite "impossible de lire").
async function sendVideoFile(sock, jid, filePath, caption) {
  const stat = await fsPromises.stat(filePath);
  if (stat.size > MAX_SIZE) {
    try { await fsPromises.unlink(filePath); } catch (_) {}
    await sendText(sock, jid, '❌ Vidéo trop lourde (max 60 MB).');
    return false;
  }
  const buf = await fsPromises.readFile(filePath);
  await sock.sendMessage(jid, {
    video: buf,
    mimetype: 'video/mp4',
    caption: caption || '✅ Vidéo téléchargée',
  });
  try { await fsPromises.unlink(filePath); } catch (_) {}
  return true;
}
async function sendVideoBuffer(sock, jid, buffer, caption) {
  if (buffer.length > MAX_SIZE) {
    await sendText(sock, jid, '❌ Vidéo trop lourde (max 60 MB).');
    return false;
  }
  await sock.sendMessage(jid, {
    video: buffer,
    mimetype: 'video/mp4',
    caption: caption || '✅ Vidéo téléchargée',
  });
  return true;
}
 // Helper: try to download using yt-dlp (wrapper or system binary)
 async function downloadWithYtDlp(url, baseName) {
   const outPattern = path.join(paths.temp, `${baseName}.%(ext)s`);
   if (!fs.existsSync(paths.temp)) fs.mkdirSync(paths.temp, { recursive: true });

   const commonOpts = {
    output: outPattern,
    quiet: true,
    noWarnings: true,
    noPlaylist: true,
    // Formats compatibles WhatsApp (h264 + aac dans mp4)
    format: 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
    mergeOutputFormat: 'mp4',
    // Réduit les blocages bot
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // TikTok / IG
    addHeader: ['Referer:https://www.tiktok.com/'],
  };

   // Try npm wrapper first
   try {
     let ytdlp = null;
     try { ytdlp = require('yt-dlp-exec'); } catch (_) {}
     if (!ytdlp) {
       try { ytdlp = require('youtube-dl-exec'); } catch (_) {}
     }

     if (ytdlp) {
       await ytdlp(url, commonOpts);
       const files = glob.sync(path.join(paths.temp, `${baseName}.*`));
       if (files && files.length) return { path: files[0] };
     }
   } catch (e) {
     logger.warn({ err: e && (e.message || String(e)).slice(0, 500) }, 'yt-dlp wrapper failed');
   }

   // Fallback: try system binary
   try {
     const args = [
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '-o', outPattern,
      '--user-agent', commonOpts.userAgent,
      url,
     ];
     await new Promise((resolve, reject) => {
       const p = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
       let errOut = '';
       p.stderr.on('data', (d) => { errOut += d.toString(); });
       p.on('error', reject);
       p.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('yt-dlp exit ' + code + (errOut ? ': ' + errOut.slice(0, 300) : '')));
      });
     });

     const files = glob.sync(path.join(paths.temp, `${baseName}.*`));
     if (files && files.length) return { path: files[0] };
   } catch (e) {
     logger.warn({ err: e && (e.message || String(e)).slice(0, 500) }, 'yt-dlp binary failed');
   }

   return null;
 }
 /**
 * Cobalt API moderne (POST / avec Accept: application/json).
 * Instances communautaires (peuvent changer).
 */
const COBALT_INSTANCES = [
  'https://api.cobalt.rpkiinval.id',
  'https://cobalt-omega.wolfy.love',
  'https://lime.clxxped.lol',
  'https://nuko-c.meowing.de',
];

async function downloadWithCobalt(url) {
  const body = {
    url,
    videoQuality: '720',
    filenameStyle: 'basic',
    downloadMode: 'auto',
  };
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  for (const base of COBALT_INSTANCES) {
    try {
      const res = await axios.post(base + '/', body, {
        headers,
        timeout: 45000,
        validateStatus: (s) => s < 500,
      });
      const data = res.data;
      if (!data || typeof data !== 'object') continue;

      // Nouveau format cobalt (status: tunnel | redirect | picker | error)
      if (data.status === 'error') {
        logger.warn({ base, error: data.error || data.text }, 'cobalt instance error');
        continue;
      }

      let mediaUrl = null;
      if (data.status === 'tunnel' || data.status === 'redirect') {
        mediaUrl = data.url;
      } else if (data.status === 'picker' && data.picker?.[0]?.url) {
        mediaUrl = data.picker[0].url;
      } else if (data.url) {
        mediaUrl = data.url;
      }

      if (!mediaUrl) continue;

      const video = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 90000,
        maxContentLength: MAX_SIZE,
        headers: mediaUrl.includes(base) ? headers : {},
      });
      if (video.data && video.data.byteLength > 0) {
        return Buffer.from(video.data);
      }
    } catch (e) {
      logger.warn({ base, err: e && e.message }, 'cobalt instance failed');
    }
  }
  return null;
}

 // Detect available backend at module load
 let DL_BACKEND = 'none';
 try { require.resolve('yt-dlp-exec'); DL_BACKEND = 'yt-dlp-exec'; } catch (_) {
   try { require.resolve('youtube-dl-exec'); DL_BACKEND = 'youtube-dl-exec'; } catch (_) {}
 }
 try { logger.info({ DL_BACKEND }, 'dl backend selected at module load'); } catch (_) {}

 module.exports = {
   name: 'dl',
   aliases: ['download', 'video'],
   description: 'Télécharge une vidéo depuis un lien (YouTube, TikTok, etc.)',
   category: 'media',

   async execute({ sock, jid, args }) {
     const url = (args && args[0]) || '';
     if (!url || !!/^https?:\/\//i.test(url)) {
       return sendText(sock, jid,
         '⚠️ Envoyez un lien valide.\nEx: `||dl https://youtu.be/xxx`\nSupporte: YouTube, Instagram, TikTok, Facebook, Twitter...'
       );
     }

     await sendText(sock, jid, '⏳ Téléchargement en cours...');

     const baseName = `dl_${Date.now()}`;
     const isYt = /youtu\.?be|youtube\.com/i.test(url);
     const isTikTok = /tiktok\.com|vm\.tiktok/i.test(url);

     // ── 1) yt-dlp en premier ──
    try {
      const res = await downloadWithYtDlp(url, baseName);
      if (res && res.path) {
        const ok = await sendVideoFile(sock, jid, res.path, '✅ Vidéo téléchargée');
        if (ok) return;
      }
    } catch (e) {
      logger.warn({ err: e && e.message }, 'yt-dlp primary failed');
    }

    // ── 2) Cobalt (instances communautaires) ──
     try {
         const buf = await downloadWithYtDlp(url);
         if (buf) {
           await sendVideoBuffer(sock, jid, buf, '✅ Vidéo téléchargée');
           return;
         }
       } catch (e) {
         logger.warn({ err: e && e.message }, 'cobalt fallback failed');
       }

       // ── Messages d'erreur ciblés ──
    if (isYt) {
      return sendText(sock, jid,
        '❌ YouTube bloqué (anti-bot).\n' +
        '➡️ Sur le serveur, installez une version récente de *yt-dlp* et éventuellement des cookies YouTube.\n' +
        'Commande admin: `yt-dlp -U`'
      );
    }
    if (isTikTok) {
      return sendText(sock, jid,
        '❌ TikTok indisponible pour le moment.\n' +
        '➡️ Réessayez plus tard, ou mettez à jour yt-dlp (`yt-dlp -U`).'
      );
    }

    return sendText(sock, jid,
      '❌ Impossible de télécharger cette vidéo.\n' +
      'Vérifiez le lien ou réessayez plus tard.'
    );
  },
};