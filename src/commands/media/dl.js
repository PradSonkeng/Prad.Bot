'use strict';
const { sendText } = require('../../utils/messageUtils');
const youtubedl    = require('youtube-dl-exec');
const fs           = require('fs');
const path         = require('path');
const { paths } = require('../../config/config');

module.exports = {
    name: 'dl',
    aliases: ['download', 'instagram', 'ig', 'youtube', 'yt', 'facebook', 'fb', 'tiktok', 'tt'],
    description: 'Télécharge une vidéo (YouTube, Instagram, TikTok, Facebook...)',
    category: 'media',

    async execute({ sock, jid }, args) {
        const url = args[0];
        if (!url || !url.startsWith('http')) {
            return sendText(sock, jid,
                '⚠️ Envoyez un lien valide.\n' +
                'Ex:`||dl https://youtu.be/xxx`\n' +
                'Supporte: YouTube, Instagram, TikTok, Facebook, Twitter...'
            );
        }

        await sendText(sock, jid, '⏳ Téléchargement en cours...');

        const tmpFile = path.join(paths.temp, `dl_${Date.now()}.mp4`);

        try {
            await youtubedl(url, {
                output:          tmpFile,
                format:          'bestvideo[ext=mp4][filesize<50M]+bestaudio[ext=m4a]/best[ext=mp4][filesize<50M]/best',
                mergeOutputFormat: 'mp4',
                noPlaylist:      true,
                noWarnings:      true,
            });

            if (!fs.existsSync(tmpFile)) {
                return sendText(sock, jid, '❌ Échec du téléchargement. Le fichier n\'a pas été trouvé.');
            }
            const stats = fs.statSync(tmpFile);
            if (stats.size > 50 * 1024 * 1024) {
                fs.unlinkSync(tmpFile);
                return sendText(sock, jid, '❌ Le fichier téléchargé dépasse la limite de 50MB.');
            }

            const buffer = fs.readFileSync(tmpFile);
            fs.unlinkSync(tmpFile);

            await sock.sendMessage(jid, {
                video: buffer,
                caption: `📥 Vidéo téléchargée depuis:\n${url}`,
            });
        }catch (err) {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            await sendText(sock, jid, '❌ Une erreur est survenue lors du téléchargement de la vidéo.');
        }
    },
};