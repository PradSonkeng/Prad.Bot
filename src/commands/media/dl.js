'use strict';
const { sendText } = require('../../utils/messageUtils');
const axios        = require('axios');
const fs           = require('fs');
const path         = require('path');
const { paths } = require('../../config/config');

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

        const tmpFile = path.join(paths.temp, `dl_${Date.now()}.mp4`);

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

    } catch (err) {
      await sendText(sock, jid,
        '❌ Impossible de télécharger.\n💡 Vérifiez que le lien est public et réessayez.'
      );
    }
    },
};