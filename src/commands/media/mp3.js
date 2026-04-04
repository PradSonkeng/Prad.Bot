'use strict';
const { sendText } = require('../../utils/messageUtils');
const axios        = require('axios');
const fs           = require('fs');
const path         = require('path');
const { paths }    = require('../../config/config');
const logger       = require('../../utils/logger');

module.exports = {
    name: 'mp3',
    aliases: ['audio', 'music', 'song', 'musique'],
    description: 'Télécharge l\'audio d\'une vidéo YouTube en MP3',
    category: 'media',

    async execute({ sock, jid, args }) {
        const url = (args && args[0]) || '';
        if (!url || !url.startsWith('http')) {
            return sendText(sock, jid,
                '⚠️ Envoyez un lien valide.\n' +
                'Ex:`||mp3 https://youtu.be/xxx`\n' +
                'Supporte: YouTube, Instagram, TikTok, Facebook, Twitter...'
            );
        }

        await sendText(sock, jid, '⏳ Téléchargement de l\'audio en cours...');

        const tmpFile = path.join(paths.temp, `mp3_${Date.now()}.mp3`);

        try {
            const res = await axios.post('https://api.cobalt.tools/api/json', {
            url,
            aFormat:      'mp3',
            isAudioOnly:  true,
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
                        if (typeof data.text === 'string' && data.text.toLowerCase().includes('cobalt v7 api has been shut down')) {
                            return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer un remplaçant (ex: yt-dlp) ou d'utiliser une API alternative.`);
                        }
                        return sendText(sock, jid, `❌ ${data.text || 'Erreur.'}`);
                }

                if (data.status === 'redirect' || data.status === 'stream') {
                        const audio = await axios.get(data.url, {
                        responseType: 'arraybuffer',
                        timeout:      60000,
                        maxContentLength: 60 * 1024 * 1024,
                        });

                        await sock.sendMessage(jid, {
                        audio:    Buffer.from(audio.data),
                        mimetype: 'audio/mpeg',
                        ptt:      false,
                        });

                        await sendText(sock, jid, '✅ Audio téléchargé !');
                        return;
                }

                // Fallback: try yt-dlp if cobalt didn't provide a stream
                try {
                    const baseName = `mp3_${Date.now()}`;
                    const downloaded = await (async function downloadFallback() {
                        const outPattern = path.join(paths.temp, `${baseName}.%(ext)s`);
                        try {
                            const ytdlpExec = require('yt-dlp-exec');
                            await ytdlpExec(url, { output: outPattern, quiet: true });
                            const files = require('glob').sync(path.join(paths.temp, `${baseName}.*`));
                            if (files.length) return { path: files[0] };
                        } catch (e) {}
                        try {
                            const { spawn } = require('child_process');
                            await new Promise((resolve, reject) => {
                                const p = spawn('yt-dlp', ['-x', '--audio-format', 'mp3', '-o', outPattern, url], { stdio: 'ignore' });
                                p.on('error', reject);
                                p.on('close', (code) => code === 0 ? resolve() : reject(new Error('yt-dlp exit ' + code)));
                            });
                            const files = require('glob').sync(path.join(paths.temp, `${baseName}.*`));
                            if (files.length) return { path: files[0] };
                        } catch (e) {}
                        return null;
                    })();

                    if (downloaded) {
                        const buf = fs.readFileSync(downloaded.path);
                        await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: false });
                        try { fs.unlinkSync(downloaded.path); } catch (e) {}
                        await sendText(sock, jid, '✅ Audio téléchargé (via yt-dlp)');
                        return;
                    }
                } catch (e) {
                    try { logger.warn({ err: e && e.message }, 'mp3 yt-dlp fallback failed'); } catch (e) {}
                }

                await sendText(sock, jid, '❌ Format non supporté.');
        } catch (err) {
            try { logger.error({ message: err.message, stack: err.stack, responseData: err.response?.data }, 'mp3 command failed'); } catch (e) {}
            const respText = err.response?.data?.text;
            if (typeof respText === 'string' && respText.toLowerCase().includes('cobalt v7 api has been shut down')) {
              return sendText(sock, jid, `❌ Le service de téléchargement (cobalt.tools) n'est plus disponible — mise à jour nécessaire côté serveur.\n\nDemandez à l'administrateur d'installer un remplaçant (ex: yt-dlp) ou d'utiliser une API alternative.`);
            }
            await sendText(sock, jid,
                '❌ Impossible d\'extraire l\'audio.\n💡 Vérifiez que le lien est public.'
            );
        }
    },
};