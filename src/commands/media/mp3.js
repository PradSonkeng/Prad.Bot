'use strict';
const { sendText } = require('../../utils/messageUtils');
const axios        = require('axios');
const fs           = require('fs');
const path         = require('path');
const { paths } = require('../../config/config');

module.exports = {
    name: 'mp3',
    aliases: ['audio', 'music', 'song', 'musique'],
    description: 'Télécharge l\'audio d\'une vidéo YouTube en MP3',
    category: 'media',

    async execute({ sock, jid }, args) {
        const url = args[0];
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

        await sendText(sock, jid, '❌ Format non supporté.');

        } catch (err) {
            await sendText(sock, jid,
                '❌ Impossible d\'extraire l\'audio.\n💡 Vérifiez que le lien est public.'
            );
        }
    },
};