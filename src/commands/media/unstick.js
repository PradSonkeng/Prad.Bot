const { downloadMedia, getMediaType, getTargetMediaMsg, isAnimatedWebp, stickerToVideo, } = require('../../utils/mediaUtils');
const { sendText, sendImage, sendVideo }          = require('../../utils/messageUtils');

module.exports = {
  name: 'unstick',
  aliases: ['desticker', 'toimage', 'tovideo'],
  description: 'Convertit un sticker en image ou en vidéo (si animé)',
  category: 'media',

  async execute({ sock, jid, msg }) {
    const targetMsg = getTargetMediaMsg(msg);
    const mediaInfo = getMediaType(targetMsg);

    if (!mediaInfo || mediaInfo.type !== 'sticker') {
      return sendText(sock, jid, '⚠️ Répondez à un *sticker* pour le convertir en image.');
    }

    // Vérifie que le mediaKey est présent (évite l'erreur "empty media key")
    if (!mediaInfo.raw?.mediaKey) {
      return sendText(sock, jid,
        '❌ Impossible de télécharger ce sticker.\n' +
        'Réessayez en répondant directement au sticker, ou renvoyez le sticker.'
      );
    }

    await sendText(sock, jid, '⏳ Conversion en cours...');

    try {
      const buffer = await downloadMedia(sock, msg);
      const animated = mediaInfo.isAnimated || isAnimatedWebp(buffer);

      if (animated) {
        const video = await stickerToVideo(buffer);
        if (video) {
          return sendVideo(sock, jid, video, '✅ Sticker converti.');
        }
        // Fallback image si ffmpeg échoue
        return sendImage(sock, jid, buffer, '⚠️ Conversion vidéo impossible — envoi en image (WebP).');
      }

      await sendImage(sock, jid, buffer, '✅ Sticker converti.');
    } catch (err){
      const errMsg = err && (err.message || String(err));
      if (/empty media key|Cannot derive from empty media key/i.test(errMsg || '')) {
        return sendText(sock, jid,
          '❌ Impossible de convertir ce sticker.\n' +
          'Le sticker est peut-être trop ancien ou partiellement reçu. Renvoyez-le puis réessayez.'
        );
      }
      throw err;
    }
  },
};
