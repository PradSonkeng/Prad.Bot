const { isGroupAdmin }   = require('../../middlewares/adminCheck');
const { downloadMedia, getMediaType } = require('../../utils/mediaUtils');
const { sendText, sendImage, sendVideo, sendAudio } = require('../../utils/messageUtils');

module.exports = {
  name: 'extract',
  aliases: ['save', 'extraire'],
  description: 'Extrait un média envoyé en vue unique (photo/vidéo/audio)',
  category: 'media',

  async execute({ sock, jid, msg }) {
    // Le message doit être une réponse à un média vue unique
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const targetMsg = quoted
      ? { message: quoted, key: msg.key }
      : msg;

    const mediaInfo = getMediaType(targetMsg);
    if (!mediaInfo) return sendText(sock, jid, '⚠️ Répondez à un média (photo, vidéo, audio) en vue unique.');

    await sendText(sock, jid, '⏳ Extraction en cours...');
    const buffer = await downloadMedia(sock, targetMsg);

    switch (mediaInfo.type) {
      case 'image':
        return sendImage(sock, jid, buffer, '✅ Image extraite en haute résolution.');
      case 'video':
        return sendVideo(sock, jid, buffer, '✅ Vidéo extraite.');
      case 'audio':
        return sendAudio(sock, jid, buffer, false);
      case 'sticker':
        return sendImage(sock, jid, buffer, '✅ Sticker extrait.');
      default:
        return sendText(sock, jid, '❌ Type de média non supporté.');
    }
  },
};