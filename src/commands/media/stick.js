'use strict';

const { downloadMedia, getMediaType, getTargetMediaMsg, imageToSticker, videoToSticker, isAnimatedWebp }
                                     = require('../../utils/mediaUtils');
const { sendText, sendSticker }      = require('../../utils/messageUtils');

module.exports = {
  name: 'stick',
  aliases: ['sticker', 's'],
  description: 'Convertit une photo ou vidéo en sticker',
  category: 'media',

  async execute({ sock, jid, msg }) {
    const targetMsg = getTargetMediaMsg(msg);
    const mediaInfo = getMediaType(targetMsg);

    if (!mediaInfo || !['image', 'video'].includes(mediaInfo.type)) {
      return sendText(sock, jid, '⚠️ Répondez à une *image* ou *vidéo* pour créer un sticker.');
    }

    await sendText(sock, jid, '⏳ Création du sticker...');

    try {
      const buffer = await downloadMedia(sock, msg);

      if (mediaInfo.type === 'video') {
        const sticker = await videoToSticker(buffer);
        if (!sticker) {
         return sendText(sock, jid, '❌ Conversion vidéo impossible.\n' );
      }
      const animated = isAnimatedWebp(sticker);
      // isAnimated aide WhatsApp/Baileys à traiter le WebP multi-frames
      return sendSticker(sock, jid, sticker, { isAnimated: animated, gifPlayback: animated });
    }
    const sticker = await imageToSticker(buffer);
    await sendSticker(sock, jid, sticker, { isAnimated: false });
    } catch (err) {
      const errMsg = err && (err.message || String(err));
      if (/empty media key|Cannot derive from empty media key/i.test(errMsg || '')) {
        return sendText(sock, jid,
          '❌ Impossible de télécharger le média.\n' +
          'Renvoyez l\'image/vidéo puis réessayez.'
        );
      }
      throw err;
    }
  },
};
