'use strict';

const { sendText } = require('../../utils/messageUtils');
const { downloadMedia, getTargetMediaMsg, getMediaType } = require('../../utils/mediaUtils');
module.exports = {
  name: 'statusd',
  aliases: ['status', 'story'],
  description: 'Télécharge un status WhatsApp (répondez à un status)',
  category: 'general',

    async execute({ sock, jid, msg }) {
        const targetMsg = getTargetMediaMsg(msg);
        const mediaInfo = getMediaType(targetMsg);

        if (!mediaInfo || !['image', 'video'].includes(mediaInfo.type)) {
            return sendText(sock, jid, '⚠️ Répondez à un *status* (image ou vidéo) pour le télécharger.');
        }

        await sendText(sock, jid, '⏳ Téléchargement du status...');

        try {
            const buffer = await downloadMedia(sock, msg);

            if (mediaInfo.type === 'image') {
                await sock.sendMessage(jid, { image: buffer, caption: '📸 Voici le status téléchargé.' });
            }else {
                await sock.sendMessage(jid, { video: buffer, caption: '🎥 Voici le status téléchargé.' });
            }
        }catch {
            await sendText(sock, jid, '❌ Impossible de télécharger le status. Assurez-vous que le status est encore disponible.');
        }
    },
};