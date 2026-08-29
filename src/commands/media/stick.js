'use strict';

const { downloadMedia, getMediaType, imageToSticker, videoToSticker, isAnimatedWebp }
                                     = require('../../utils/mediaUtils');
const { sendText, sendSticker }      = require('../../utils/messageUtils');

module.exports = {
  name: 'stick',
  aliases: ['sticker', 's'],
  description: 'Convertit une photo ou vidéo en sticker',
  category: 'media',

  async execute({ sock, jid, msg }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const targetMsg = quoted ? { message: quoted, key: msg.key } : msg;

    const mediaInfo = getMediaType(targetMsg);
    if (!mediaInfo || !['image', 'video'].includes(mediaInfo.type)) {
      return sendText(sock, jid, '⚠️ Répondez à une *image* ou *vidéo* pour créer un sticker.');
    }

    await sendText(sock, jid, '⏳ Création du sticker...');

    const buffer = await downloadMedia(sock, targetMsg);

    if (mediaInfo.type === 'video') {
      sticker = await videoToSticker(buffer);
      if (!sticker) {
        return sendText(sock, jid,
          '❌ Conversion vidéo impossible.\n'
        );
      }
      const animated = isAnimatedWebp(sticker);
      // isAnimated aide WhatsApp/Baileys à traiter le WebP multi-frames
      return sendSticker(sock, jid, sticker, { isAnimated: animated, gifPlayback: animated });
    }
    const sticker = await imageToSticker(buffer);
    await sendSticker(sock, jid, sticker, { isAnimated: false });
  },
};
