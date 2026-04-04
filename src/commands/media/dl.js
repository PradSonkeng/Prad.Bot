"use strict";
const { sendText } = require("../../utils/messageUtils");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { paths } = require("../../config/config");
const logger = require("../../utils/logger");
const fsPromises = require("fs").promises;
const { spawn } = require("child_process");
const glob = require("glob");

// Download using yt-dlp-exec or youtube-dl-exec, or fall back to system yt-dlp binary.
async function downloadWithYtDlp(url, outPath, opts = {}) {
  // outPath should include the desired filename (eg /tmp/name.mp4)
  try {
    let ytdlp = null;
    try { ytdlp = require("yt-dlp-exec"); } catch (e) {}
    if (!ytdlp) {
      try { ytdlp = require("youtube-dl-exec"); } catch (e) {}
    }

    if (ytdlp) {
      const ytdlOpts = Object.assign({}, opts, {
        output: outPath,
        quiet: true,
        noWarnings: true,
      });
      await ytdlp(url, ytdlOpts);
      // if outPath used a pattern with %(ext)s, glob it
      if (!fs.existsSync(outPath)) {
        const files = glob.sync(path.join(path.dirname(outPath), path.basename(outPath).replace(/%(?:\(.*?\))?ext%?/g, "*")));
        if (files.length) return { ok: true, path: files[0], size: fs.statSync(files[0]).size };
      }
      if (fs.existsSync(outPath)) return { ok: true, path: outPath, size: fs.statSync(outPath).size };
      return { ok: false, error: "no-file" };
    }

    // Try system yt-dlp
    const args = [];
    if (opts.isAudioOnly) {
      args.push("-x", "--audio-format", opts.audioFormat || "mp3");
    }
    if (opts.format) args.push("-f", opts.format);
    args.push("-o", outPath, url);

    await new Promise((resolve, reject) => {
      const p = spawn("yt-dlp", args, { stdio: "ignore" });
      p.on("error", reject);
      p.on("close", (code) => code === 0 ? resolve() : reject(new Error("yt-dlp exit " + code)));
    });

    // glob result
    const files = glob.sync(path.join(path.dirname(outPath), path.basename(outPath).replace(/%(?:\(.*?\))?ext%?/g, "*")));
    if (files.length) return { ok: true, path: files[0], size: fs.statSync(files[0]).size };
    return { ok: false, error: "no-file" };
  } catch (err) {
    logger.warn({ err: err && err.message }, "yt-dlp download failed");
    return { ok: false, error: err && (err.message || String(err)) };
  }
}

module.exports = {
  name: "dl",
  aliases: ["download", "instagram", "ig", "youtube", "yt", "facebook", "fb", "tiktok", "tt"],
  description: "Télécharge une vidéo (YouTube, Instagram, TikTok, Facebook...)",
  category: "media",

  async execute({ sock, jid, args }) {
    const url = (args && args[0]) || "";
    if (!url || !url.startsWith("http")) {
      return sendText(sock, jid,
        "⚠️ Envoyez un lien valide.\n" +
        "Ex:`||dl https://youtu.be/xxx`\n" +
        "Supporte: YouTube, Instagram, TikTok, Facebook, Twitter..."
      );
    }

    await sendText(sock, jid, "⏳ Téléchargement en cours...");

    const baseName = `dl_${Date.now()}`;
    const tmpOut = path.join(paths.temp, `${baseName}.%(ext)s`);

    try {
      const res = await axios.post('https://api.cobalt.tools/api/json', {
        url,
        vCodec: 'h264',
        vQuality: '720',
        aFormat: 'mp3',
        filenamePattern: 'basic',
        isAudioOnly: false,
        disableMetadata: true,
      }, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const data = res.data;
      try { logger.info({ url, status: res.status, data: (typeof data === 'object' ? data : String(data).slice(0, 500)) }, 'cobalt.tools response'); } catch (e) {}

      if (!data || typeof data !== 'object') {
        try { logger.warn({ url, status: res.status, body: String(res.data).slice(0,1000) }, 'cobalt.tools returned unexpected body'); } catch (e) {}
        return sendText(sock, jid, '❌ Le service de téléchargement a renvoyé une réponse inattendue.');
      }

      if (data.status === 'error') {
        try { logger.warn({ url, error: data.text }, 'cobalt.tools reported error'); } catch (e) {}

        if (typeof data.text === 'string' && data.text.toLowerCase().includes('cobalt v7 api has been shut down')) {
          // attempt local yt-dlp fallback
          const outFile = path.join(paths.temp, `${baseName}.mp4`);
          const r = await downloadWithYtDlp(url, outFile, { format: 'bestvideo[ext=mp4]+bestaudio/best', mergeOutputFormat: 'mp4' });
          if (r && r.ok) {
            if (r.size > 60 * 1024 * 1024) {
              await sendText(sock, jid, '❌ Vidéo trop lourde (max 60 MB).');
              try { await fsPromises.unlink(r.path); } catch (e) {}
              return;
            }
            const buffer = await fsPromises.readFile(r.path);
            await sock.sendMessage(jid, { video: Buffer.from(buffer), caption: '✅ Vidéo téléchargée (via yt-dlp)' });
            try { await fsPromises.unlink(r.path); } catch (e) {}
            return;
          }

          // fallback failed or not available
          return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer yt-dlp (ou d'ajouter le package yt-dlp-exec) ou d'utiliser une API alternative.`);
        }

        return sendText(sock, jid, `❌ ${data.text || 'Erreur de téléchargement.'}`);
      }

      if (data.status === 'redirect' || data.status === 'stream') {
        const videoUrl = data.url;
        const video = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 60 * 1024 * 1024 });
        if (video.data.byteLength > 60 * 1024 * 1024) return sendText(sock, jid, '❌ Vidéo trop lourde (max 60 MB).');
        await sock.sendMessage(jid, { video: Buffer.from(video.data), caption: '✅ Vidéo téléchargée' });
        return;
      }

      if (data.status === 'picker') {
        const item = data.picker?.[0];
        if (!item?.url) return sendText(sock, jid, '❌ Impossible de récupérer la vidéo.');
        const video = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 60000 });
        await sock.sendMessage(jid, { video: Buffer.from(video.data), caption: '✅ Vidéo téléchargée' });
        return;
      }

      await sendText(sock, jid, '❌ Format non supporté.');

      // as a last resort, try local yt-dlp
      try {
        const outFile = path.join(paths.temp, `${baseName}.mp4`);
        const r2 = await downloadWithYtDlp(url, outFile, { format: 'bestvideo[ext=mp4]+bestaudio/best', mergeOutputFormat: 'mp4' });
        if (r2 && r2.ok) {
          const buf = fs.readFileSync(r2.path);
          await sock.sendMessage(jid, { video: buf, caption: '✅ Vidéo téléchargée (via yt-dlp)' });
          try { fs.unlinkSync(r2.path); } catch (e) {}
          return;
        }
      } catch (e) {
        try { logger.warn({ err: e.message }, 'yt-dlp fallback failed'); } catch (e) {}
      }

    } catch (err) {
      try { logger.error({ message: err.message, stack: err.stack, responseData: err.response?.data, status: err.response?.status }, 'dl command failed'); } catch (e) {}
      const respText = err.response?.data?.text;
      if (typeof respText === 'string' && respText.toLowerCase().includes('cobalt v7 api has been shut down')) {
        // try direct fallback when axios threw
        const outFile = path.join(paths.temp, `${baseName}.mp4`);
        const r = await downloadWithYtDlp(url, outFile, { format: 'bestvideo[ext=mp4]+bestaudio/best', mergeOutputFormat: 'mp4' });
        if (r && r.ok) {
          if (r.size > 60 * 1024 * 1024) {
            return sendText(sock, jid, '❌ Vidéo trop lourde (max 60 MB).');
          }
          const buffer = await fsPromises.readFile(r.path);
          await sock.sendMessage(jid, { video: Buffer.from(buffer), caption: '✅ Vidéo téléchargée (via yt-dlp)' });
          try { await fsPromises.unlink(r.path); } catch (e) {}
          return;
        }
        return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer yt-dlp (ou d'ajouter le package yt-dlp-exec) ou d'utiliser une API alternative.`);
      }

      await sendText(sock, jid, '❌ Impossible de télécharger.\n💡 Vérifiez que le lien est public et réessayez. Si le problème persiste, contactez l\'administrateur.');
    }
  },
};
'use strict';
const { sendText } = require('../../utils/messageUtils');
const axios        = require('axios');
const fs           = require('fs');
const path         = require('path');
const { paths }    = require('../../config/config');
const logger       = require('../../utils/logger');
const fsPromises    = require('fs').promises;

// Try to download using yt-dlp (preferred) or youtube-dl wrappers when cobalt.tools is unavailable
async function tryYtDlp(url, destPath, opts = {}) {
  // destPath should include extension (.mp4 or .mp3)
  try {
    let ytdlp = null;
    try { ytdlp = require('yt-dlp-exec'); } catch (e) {}
    if (!ytdlp) {
      try { ytdlp = require('youtube-dl-exec'); } catch (e) {}
    }

    if (!ytdlp) {
      logger.warn('yt-dlp / youtube-dl wrapper not installed');
      return { ok: false, error: 'yt-dlp not installed' };
    }

    const ytdlOpts = Object.assign({}, opts, {
      const data = res.data;

      // Diagnostic logs pour aider à comprendre pourquoi l'API peut échouer
      try { logger.info({ url, status: res.status, data: (typeof data === 'object' ? data : String(data).slice(0, 500)) }, 'cobalt.tools response'); } catch (e) {}

      if (!data || typeof data !== 'object') {
        try { logger.warn({ url, status: res.status, body: String(res.data).slice(0,1000) }, 'cobalt.tools returned unexpected body'); } catch (e) {}
        return sendText(sock, jid, '❌ Le service de téléchargement a renvoyé une réponse inattendue.');
      }

      if (data.status === 'error') {
        try { logger.warn({ url, error: data.text }, 'cobalt.tools reported error'); } catch (e) {}

        // Détection du message connu de shutdown de cobalt.tools
        if (typeof data.text === 'string' && data.text.toLowerCase().includes('cobalt v7 api has been shut down')) {
          // Try local yt-dlp fallback automatically if available
          const fallbackPath = path.join(paths.temp, `${baseName}.mp4`);
          let resY = null;
          try {
            resY = await tryYtDlp(url, fallbackPath, { format: 'bestvideo[ext=mp4]+bestaudio/best', mergeOutputFormat: 'mp4' });
            if (resY && resY.ok) {
              if (resY.size > 60 * 1024 * 1024) {
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

          // If we tried a fallback but it failed, include the reason to help debugging
          if (resY && !resY.ok) {
            return sendText(sock, jid, `❌ Le service cobalt.tools est arrêté et le fallback yt-dlp a échoué : ${resY.error || 'raison inconnue'}. Demandez à l'administrateur d'installer yt-dlp-exec ou yt-dlp.`);
          }

          return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer un remplaçant (ex: yt-dlp) ou d'utiliser une API alternative.`);
        }

        return sendText(sock, jid, `❌ ${data.text || 'Erreur de téléchargement.'}`);
      }
        vCodec:       'h264',
        vQuality:     '720',
        aFormat:      'mp3',
        filenamePattern: 'basic',
        isAudioOnly:  false,
        disableMetadata: true,
  }, {
        timeout: 30000,
      });

      const data = res.data;

      if (data.status === 'error') {
          try { logger.warn({ url, error: data.text }, 'cobalt.tools reported error'); } catch (e) {}
          // Détection du message connu de shutdown de cobalt.tools
          if (typeof data.text === 'string' && data.text.toLowerCase().includes('cobalt v7 api has been shut down')) {
            // Try local yt-dlp fallback automatically if available
            const fallbackPath = path.join(paths.temp, `${baseName}.mp4`);
            try {
              const resY = await tryYtDlp(url, fallbackPath, { format: 'bestvideo[ext=mp4]+bestaudio/best', mergeOutputFormat: 'mp4' });
            // If we tried a fallback but it failed, include the reason to help debugging
            if (resY && !resY.ok) {
              return sendText(sock, jid, `❌ Le service cobalt.tools est arrêté et le fallback yt-dlp a échoué : ${resY.error || 'raison inconnue'}. Demandez à l'administrateur d'installer yt-dlp-exec ou yt-dlp.`);
            }

            return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer un remplaçant (ex: yt-dlp) ou d'utiliser une API alternative.`);
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

            return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer un remplaçant (ex: yt-dlp) ou d'utiliser une API alternative.`);
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