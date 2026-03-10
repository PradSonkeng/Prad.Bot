const { downloadMedia, getMediaType } = require('../../utils/mediaUtils');
const { sendText, sendImage }          = require('../../utils/messageUtils');
const sharp                            = require('sharp');

module.exports = {
  name: 'unstick',
  aliases: ['desticker', 'toimage'],
  description: 'Convertit un sticker en image',
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
    // ✅ Convertir WebP → PNG lisible par Sharp/Baileys
    const imageBuffer = await sharp(buffer)
      .png()
      .toBuffer();

    await sendImage(sock, jid, imageBuffer, '✅ Sticker converti en image.');
    
    await sendImage(sock, jid, buffer, '✅ Sticker converti en image.');
  },
};