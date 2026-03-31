'use strict';

const { sendText } = require('../../utils/messageUtils');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'statusd',
  aliases: ['status', 'story'],
  description: 'Télécharge un status WhatsApp (répondez à un status)',
  category: 'general',

    async execute({ sock, jid, msg }) {
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted ) {
            return sendText(sock, jid, '⚠️ Répondez à un *status* pour le télécharger.');
        }

        await sendText(sock, jid, '⏳ Téléchargement du status...');

        try {
            const tragetMsg = { message: quoted, key: msg.key };
            const buffer = await downloadMediaMessage(tragetMsg, 'buffer', {});

            const type = Object.keys(quoted)[0]; // imageMessage, videoMessage, etc.
            if (type.includes('image')) {
                await sock.sendMessage(jid, { image: buffer, caption: '📸 Voici le status téléchargé.' });
            }else if (type.includes('video')) {
                await sock.sendMessage(jid, { video: buffer, caption: '🎥 Voici le status téléchargé.' });
            } else {
                await sendText(sock, jid, '⚠️ Type de media non supporté pour le téléchargement.');
            }
        }catch {
            await sendText(sock, jid, '❌ Impossible de télécharger le status. Assurez-vous que le status est encore disponible et que vous avez les permissions nécessaires.');
        }
    },
};