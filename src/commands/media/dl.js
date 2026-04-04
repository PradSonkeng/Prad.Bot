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

 // Helper: try to download using yt-dlp (wrapper or system binary)
 async function downloadWithYtDlp(url, baseName, isAudioOnly = false) {
   const outPattern = path.join(paths.temp, `${baseName}.%(ext)s`);

   // Try npm wrapper first
   try {
     let ytdlp = null;
     try { ytdlp = require('yt-dlp-exec'); } catch (e) {}
     if (!ytdlp) {
       try { ytdlp = require('youtube-dl-exec'); } catch (e) {}
     }

     if (ytdlp) {
       const opts = { output: outPattern, quiet: true };
       if (isAudioOnly) {
         opts.extractAudio = true;
         opts.audioFormat = 'mp3';
       } else {
         opts.format = 'bestvideo[ext=mp4]+bestaudio/best';
         opts.mergeOutputFormat = 'mp4';
       }

       await ytdlp(url, opts);
       const files = glob.sync(path.join(paths.temp, `${baseName}.*`));
       if (files && files.length) return { path: files[0] };
     }
   } catch (e) {
     logger.warn({ err: e && (e.message || String(e)) }, 'yt-dlp wrapper failed');
   }

   // Fallback: try system binary
   try {
     const args = isAudioOnly
       ? ['-x', '--audio-format', 'mp3', '-o', outPattern, url]
       : ['-f', 'bestvideo+bestaudio/best', '-o', outPattern, url];

     await new Promise((resolve, reject) => {
       const p = spawn('yt-dlp', args, { stdio: 'ignore' });
       p.on('error', reject);
       p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('yt-dlp exit ' + code))));
     });

     const files = glob.sync(path.join(paths.temp, `${baseName}.*`));
     if (files && files.length) return { path: files[0] };
   } catch (e) {
     logger.warn({ err: e && (e.message || String(e)) }, 'yt-dlp binary failed');
   }

   return null;
 }

 // Detect available backend at module load
 let DL_BACKEND = 'cobalt.tools';
 try { require.resolve('yt-dlp-exec'); DL_BACKEND = 'yt-dlp-exec'; } catch (e) {
   try { require.resolve('youtube-dl-exec'); DL_BACKEND = 'youtube-dl-exec'; } catch (e2) {}
 }
 try { logger.info({ DL_BACKEND }, 'dl backend selected at module load'); } catch (e) {}

 module.exports = {
   name: 'dl',
   aliases: ['download', 'video'],
   description: 'Télécharge une vidéo depuis un lien (YouTube, TikTok, etc.)',
   category: 'media',

   async execute({ sock, jid, args }) {
     const url = (args && args[0]) || '';
     if (!url || !url.startsWith('http')) {
       return sendText(sock, jid,
         '⚠️ Envoyez un lien valide.\nEx: `||dl https://youtu.be/xxx`\nSupporte: YouTube, Instagram, TikTok, Facebook, Twitter...'
       );
     }

     await sendText(sock, jid, '⏳ Téléchargement en cours...');

     const baseName = `dl_${Date.now()}`;

     // If a local yt-dlp backend is available, prefer it
     if (DL_BACKEND !== 'cobalt.tools') {
       try {
         const res = await downloadWithYtDlp(url, baseName, false);
         if (res && res.path) {
           const stat = await fsPromises.stat(res.path);
           if (stat.size > 60 * 1024 * 1024) {
             await sendText(sock, jid, '❌ Vidéo trop lourde (max 60 MB).');
             try { await fsPromises.unlink(res.path); } catch (e) {}
             return;
           }

           const buf = await fsPromises.readFile(res.path);
           await sock.sendMessage(jid, { video: Buffer.from(buf), caption: '✅ Vidéo téléchargée (via yt-dlp)' });
           try { await fsPromises.unlink(res.path); } catch (e) {}
           return;
         }
       } catch (e) {
         logger.warn({ err: e && e.message }, 'yt-dlp preferred backend failed, falling back to cobalt.tools');
       }
     }

     // No local backend or it failed: try cobalt.tools API
     try {
       const res = await axios.post('https://api.cobalt.tools/api/json', {
         url,
         vCodec:       'h264',
         vQuality:     '720',
         aFormat:      'mp3',
         filenamePattern: 'basic',
         isAudioOnly:  false,
         disableMetadata: true,
       }, {
         headers: {
           'Accept': 'application/json',
           'Content-Type': 'application/json',
         },
         timeout: 30000,
       });

       const data = res.data;

       // Diagnostic logs
       try { logger.info({ url, status: res.status, data: (typeof data === 'object' ? data : String(data).slice(0, 500)) }, 'cobalt.tools response'); } catch (e) {}

       if (!data || typeof data !== 'object') {
         try { logger.warn({ url, status: res.status, body: String(res.data).slice(0,1000) }, 'cobalt.tools returned unexpected body'); } catch (e) {}
         return sendText(sock, jid, '❌ Le service de téléchargement a renvoyé une réponse inattendue.');
       }

       if (data.status === 'error') {
         try { logger.warn({ url, error: data.text }, 'cobalt.tools reported error'); } catch (e) {}

         if (typeof data.text === 'string' && data.text.toLowerCase().includes('cobalt v7 api has been shut down')) {
           // try local yt-dlp fallback automatically if available
           const fallbackPath = path.join(paths.temp, `${baseName}.mp4`);
           let resY = null;
           try {
             resY = await downloadWithYtDlp(url, baseName, false);
             if (resY && resY.path) {
               const stat = await fsPromises.stat(resY.path);
               if (stat.size > 60 * 1024 * 1024) {
                 await sendText(sock, jid, '❌ Vidéo trop lourde (max 60 MB).');
                 try { await fsPromises.unlink(resY.path); } catch (e) {}
                 return;
               }
               const buffer = await fsPromises.readFile(resY.path);
               await sock.sendMessage(jid, { video: Buffer.from(buffer), caption: '✅ Vidéo téléchargée (via yt-dlp)' });
               try { await fsPromises.unlink(resY.path); } catch (e) {}
               return;
             }
           } catch (e) {
             logger.warn('yt-dlp fallback error: ' + (e && e.message));
           }

           if (resY && !resY.ok) {
             return sendText(sock, jid, `❌ Le service cobalt.tools est arrêté et le fallback yt-dlp a échoué : ${resY.error || 'raison inconnue'}. Demandez à l'administrateur d'installer yt-dlp-exec ou yt-dlp.`);
           }

           return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer un remplaçant (ex: yt-dlp) ou d'utiliser une API alternative.`);
         }

         return sendText(sock, jid, `❌ ${data.text || 'Erreur de téléchargement.'}`);
       }

       if (data.status === 'redirect' || data.status === 'stream') {
         const videoUrl = data.url;
         const video    = await axios.get(videoUrl, {
           responseType: 'arraybuffer',
           timeout:      60000,
           maxContentLength: 60 * 1024 * 1024,
         });

         if (video.data.byteLength > 60 * 1024 * 1024) {
           return sendText(sock, jid, '❌ Vidéo trop lourde (max 60 MB).');
         }

         await sock.sendMessage(jid, {
           video:   Buffer.from(video.data),
           caption: '✅ Vidéo téléchargée',
         });
         return;
       }

       if (data.status === 'picker') {
         const item = data.picker?.[0];
         if (!item?.url) return sendText(sock, jid, '❌ Impossible de récupérer la vidéo.');
         const video = await axios.get(item.url, {
           responseType: 'arraybuffer',
           timeout: 60000,
         });
         await sock.sendMessage(jid, {
           video:   Buffer.from(video.data),
           caption: '✅ Vidéo téléchargée',
         });
         return;
       }

       // If cobalt didn't provide anything usable, try local yt-dlp fallback
       try {
         const downloaded = await downloadWithYtDlp(url, baseName, false);
         if (downloaded && downloaded.path) {
           const buf = fs.readFileSync(downloaded.path);
           await sock.sendMessage(jid, { video: buf, caption: '✅ Vidéo téléchargée (via yt-dlp)' });
           try { fs.unlinkSync(downloaded.path); } catch (e) {}
           return;
         }
       } catch (e) {
         try { logger.warn({ err: e.message }, 'yt-dlp fallback failed'); } catch (e) {}
       }

       await sendText(sock, jid, '❌ Format non supporté.');

     } catch (err) {
       try {
         logger.error({ message: err.message, stack: err.stack, responseData: err.response?.data, status: err.response?.status }, 'dl command failed');
       } catch (e) {}

       const respText = err.response?.data?.text;
       if (typeof respText === 'string' && respText.toLowerCase().includes('cobalt v7 api has been shut down')) {
         return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer un remplaçant (ex: yt-dlp) ou d'utiliser une API alternative.`);
       }

       await sendText(sock, jid,
         '❌ Impossible de télécharger.\n💡 Vérifiez que le lien est public et réessayez. Si le problème persiste, contactez l\'administrateur.'
       );
     }
   },
 };
 