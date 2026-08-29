const { downloadMedia, getMediaType, isAnimatedWebp, stickerToVideo, } = require('../../utils/mediaUtils');
const { sendText, sendImage, sendVideo }          = require('../../utils/messageUtils');

module.exports = {
  name: 'unstick',
  aliases: ['desticker', 'toimage', 'tovideo'],
  description: 'Convertit un sticker en image ou en vidéo (si animé)',
  category: 'media',

  async execute({ sock, jid, msg }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const targetMsg = quoted ? { message: quoted, key: msg.key } : msg;

    const mediaInfo = getMediaType(targetMsg);
    if (!mediaInfo || mediaInfo.type !== 'sticker') {
      return sendText(sock, jid, '⚠️ Répondez à un *sticker* pour le convertir en image.');
    }

    await sendText(sock, jid, '⏳ Conversion en cours...');
    const buffer = await downloadMedia(sock, targetMsg);
    const animated = mediaInfo.isAnimated || isAnimatedWebp(buffer);

    if (animated) {
      const video = await stickerToVideo(buffer);
      if (video) {
        return sendVideo(sock, jid, video, '✅ Sticker animé converti en vidéo.');
      }
      // Fallback image si ffmpeg échoue
      return sendImage(sock, jid, buffer, '⚠️ Conversion vidéo impossible — envoi en image (WebP).');
    }

    await sendImage(sock, jid, buffer, '✅ Sticker converti en image.');
  },
};
