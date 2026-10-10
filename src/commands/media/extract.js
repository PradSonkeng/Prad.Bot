const { downloadMedia, getMediaType, getTargetMediaMsg } = require('../../utils/mediaUtils');
const { sendText, sendImage, sendVideo, sendAudio } = require('../../utils/messageUtils');

module.exports = {
  name: 'extract',
  aliases: ['save', 'extraire'],
  description: 'Extrait un média envoyé en vue unique (photo/vidéo/audio)',
  category: 'media',

  async execute({ sock, jid, msg }) {
    const targetMsg = getTargetMediaMsg(msg);
    const mediaInfo = getMediaType(targetMsg);
    if (!mediaInfo) return sendText(sock, jid, '⚠️ Répondez à un média (photo, vidéo, audio) en vue unique.');

    await sendText(sock, jid, '⏳ Extraction en cours...');
    try {
      const buffer = await downloadMedia(sock, msg);

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
    } catch (err) {
      const errMsg = err && (err.message || String(err));
      if (/empty media key|Cannot derive from empty media key/i.test(errMsg || '')) {
        return sendText(sock, jid,
          '❌ Impossible d\'extraire ce média.\n' +
          'Le média est peut-être expiré ou partiellement reçu. Renvoyez-le puis réessayez.'
        );
      }
      throw err;
    }
  },
};