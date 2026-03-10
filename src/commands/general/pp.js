const { sendImage, sendText } = require('../../utils/messageUtils');
const sharp = require('sharp');

module.exports = {
  name: 'pp',
  aliases: ['photo', 'profilepic'],
  description: 'Affiche la photo de profil d\'un utilisateur en haute résolution',
  category: 'general',

  async execute({ sock, jid, msg, args }) {
    let target;

    // Si mention ou argument
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (mentioned?.length) {
      target = mentioned[0];
    } else if (args[0]) {
      target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    } else {
      // Photo du demandeur
      target = msg.key.participant || msg.key.remoteJid;
    }

    try {
      const url = await sock.profilePictureUrl(target, 'image');
      const res = await require('axios').get(url, { responseType: 'arraybuffer' });

      // ✅ Conversion en JPEG propre pour Sharp/Baileys
      const imageBuffer = await sharp(Buffer.from(res.data))
        .jpeg({ quality: 90 })
        .toBuffer();

      await sendImage(sock, jid, imageBuffer, `📸 Photo de profil de @${target.split('@')[0]}`);
    } catch {
      await sendText(sock, jid, '❌ Photo de profil introuvable ou privée.');
    }
  },
};