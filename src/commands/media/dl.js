'use strict';
const { sendText } = require('../../utils/messageUtils');
const axios        = require('axios');
const fs           = require('fs');
const path         = require('path');
const { paths }    = require('../../config/config');
const logger       = require('../../utils/logger');
const { spawn }    = require('child_process');
const glob         = require('glob');

module.exports = {
    name: 'dl',
    aliases: ['download', 'instagram', 'ig', 'youtube', 'yt', 'facebook', 'fb', 'tiktok', 'tt'],
    description: 'Télécharge une vidéo (YouTube, Instagram, TikTok, Facebook...)',
    category: 'media',

  async execute({ sock, jid, args }) {
    const url = (args && args[0]) || '';
        if (!url || !url.startsWith('http')) {
            return sendText(sock, jid,
                '⚠️ Envoyez un lien valide.\n' +
                'Ex:`||dl https://youtu.be/xxx`\n' +
                'Supporte: YouTube, Instagram, TikTok, Facebook, Twitter...'
            );
        }

        await sendText(sock, jid, '⏳ Téléchargement en cours...');

  const baseName = `dl_${Date.now()}`;
  const tmpFilePattern = path.join(paths.temp, `${baseName}.*`);

        try {
      // API cobalt.tools — supporte YouTube, TikTok, Instagram, Twitter...
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
          'Accept':       'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      const data = res.data;

      if (data.status === 'error') {
          try { logger.warn({ url, error: data.text }, 'cobalt.tools reported error'); } catch (e) {}
          // Détection du message connu de shutdown de cobalt.tools
          if (typeof data.text === 'string' && data.text.toLowerCase().includes('cobalt v7 api has been shut down')) {
            return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.

👉 Solution rapide: demandez à l'administrateur d'installer un remplaçant (ex: yt-dlp) ou de configurer une API alternative.

Je peux appliquer un correctif pour utiliser yt-dlp sur le serveur (si disponible). Dites-moi si je dois l'implémenter.`);
          }
          return sendText(sock, jid, `❌ ${data.text || 'Erreur de téléchargement.'}`);
        }

        // Diagnostic logs pour aider à comprendre pourquoi l'API peut échouer
        try { logger.info({ url, status: res.status, data: (typeof data === 'object' ? data : String(data).slice(0, 500)) }, 'cobalt.tools response'); } catch (e) {}

        if (!data || typeof data !== 'object') {
          try { logger.warn({ url, status: res.status, body: String(res.data).slice(0,1000) }, 'cobalt.tools returned unexpected body'); } catch (e) {}
          return sendText(sock, jid, '❌ Le service de téléchargement a renvoyé une réponse inattendue.');
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
        // Prendre le premier élément (meilleure qualité)
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

      await sendText(sock, jid, '❌ Format non supporté.');
      // Si on atteint ici et que cobalt ne fournit rien, tenter un fallback local avec yt-dlp
      // (si disponible). Cela permet d'éviter la dépendance externe cobalt.tools.
      try {
        const downloaded = await downloadWithYtDlp(url, baseName, false);
        if (downloaded) {
          const buf = fs.readFileSync(downloaded.path);
          await sock.sendMessage(jid, { video: buf, caption: '✅ Vidéo téléchargée (via yt-dlp)' });
          // cleanup
          try { fs.unlinkSync(downloaded.path); } catch (e) {}
          return;
        }
      } catch (e) {
        try { logger.warn({ err: e.message }, 'yt-dlp fallback failed'); } catch (e) {}
      }

    } catch (err) {
      // Log complet pour diagnostiquer (status, body, message)
      try {
        logger.error({ message: err.message, stack: err.stack, responseData: err.response?.data, status: err.response?.status }, 'dl command failed');
      } catch (e) {}

      // Si l'API cobalt indique qu'elle est arrêtée, renvoyer un message explicite
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

/**
 * Tentative de téléchargement avec yt-dlp.
 * Retourne { path } si succès, null si pas disponible.
 */
async function downloadWithYtDlp(url, baseName, isAudioOnly = false) {
  const outPattern = path.join(paths.temp, `${baseName}.%(ext)s`);

  // Preferer yt-dlp-exec if installé (npm package)
  try {
    const ytdlpExec = require('yt-dlp-exec');
    // ytdlpExec returns a Promise; use args to write file to outPattern
    const args = [];
    if (isAudioOnly) args.push('-x', '--audio-format', 'mp3');
    args.push('-o', outPattern, url);
    await ytdlpExec(url, { output: outPattern, execArgv: [], quiet: true });
    // find the downloaded file
    const files = glob.sync(path.join(paths.temp, `${baseName}.*`));
    if (files && files.length) return { path: files[0] };
    return null;
  } catch (e) {
    // fallback to binary 'yt-dlp' if available
  }

  // Try to spawn system yt-dlp binary
  try {
    const args = isAudioOnly ? ['-x', '--audio-format', 'mp3', '-o', outPattern, url] : ['-f', 'bestvideo+bestaudio/best', '-o', outPattern, url];
    await new Promise((resolve, reject) => {
      const p = spawn('yt-dlp', args, { stdio: 'ignore' });
      p.on('error', reject);
      p.on('close', (code) => code === 0 ? resolve() : reject(new Error('yt-dlp exit ' + code)));
    });
    const files = glob.sync(path.join(paths.temp, `${baseName}.*`));
    if (files && files.length) return { path: files[0] };
    return null;
  } catch (e) {
    // not available
    return null;
  }
}