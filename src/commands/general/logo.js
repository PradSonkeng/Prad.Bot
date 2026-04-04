'use strict';

const axios = require('axios');
const { sendText, sendImage } = require('../../utils/messageUtils');
const logger = require('../../utils/logger');

module.exports = {
  name: 'logo',
  aliases: ['3dlogo', 'makelogo'],
  description: 'Génère un logo 3D personnalisé à partir d\'un texte',
  category: 'general',

  async execute({ sock, jid, args }) {
    const text = args.join(' ');
    if (!text) {
      return sendText(sock, jid, '⚠️ Veuillez fournir un texte pour générer le logo. Usage: !logo <votre texte>');
    }

    await sendText(sock, jid, `⏳ Génération du logo *${text}*...`);
  try {
        const prompt = `3D glossy chrome metallic logo text "${text}", dark background, neon glow, ultra HD, 4K, professional design`;
        const url    = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
        await sendImage(sock, jid, Buffer.from(res.data), `Voici votre logo 3D personnalisé pour le texte: "${text}"`);
  } catch (err) {
    // Log the full error for diagnostics and send a friendly message to the user
    try { logger.error({ err, text, url }, 'Logo generation failed'); } catch (e) { /* ignore logger errors */ }
    await sendText(sock, jid, '❌ Impossible de générer le logo. Veuillez réessayer plus tard.');
    }
    },
};