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
        const url = `https://api.airforce/imagine2?prompt=${encodeURIComponent(prompt)}&size=1024x1024&seed=${Date.now()}`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });

        // Vérifier que la réponse est bien une image avant d'appeler sharp/baileys
        const contentType = (res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || '';
        if (!contentType.toLowerCase().startsWith('image')) {
          // Logguer un aperçu du body retourné pour diagnostic (limité)
          const bodySnippet = Buffer.from(res.data || '').toString('utf8').slice(0, 1000);
          try { logger.warn({ url, status: res.status, contentType, bodySnippet }, 'Logo API returned non-image response'); } catch (e) { /* ignore logger errors */ }
          await sendText(sock, jid, '❌ Impossible de générer le logo — le service a renvoyé une réponse invalide. Erreur enregistrée.');
          return;
        }

        try {
          await sendImage(sock, jid, Buffer.from(res.data), `Voici votre logo 3D personnalisé pour le texte: "${text}"`);
        } catch (sendErr) {
          try { logger.error({ sendErr, text }, 'Failed to send generated image'); } catch (e) { /* ignore */ }
          await sendText(sock, jid, '❌ Le logo a été généré mais impossible de l\'envoyer.');
        }
  } catch (err) {
    // Log the full error for diagnostics and send a friendly message to the user
    try { logger.error({ err, text, url }, 'Logo generation failed'); } catch (e) { /* ignore logger errors */ }
    await sendText(sock, jid, '❌ Impossible de générer le logo. Veuillez réessayer plus tard.');
    }
    },
};