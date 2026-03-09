const { bot }      = require('../../config/config');
const { sendText } = require('../../utils/messageUtils');
const fs            = require('fs');
const path          = require('path');

module.exports = {
  name: 'menu',
  aliases: ['start', 'accueil'],
  description: 'Présente le bot, sa version et ses infos',
  category: 'general',

  async execute({ sock, jid }) {
    const menu = `
      ╔══════════════════════════╗
      ║   *${bot.name}* — v${bot.version}   ║
      ╚══════════════════════════╝

      🤖 *Présentation*
      Je suis un bot WhatsApp modulaire haute performance, conçu avec Node.js, Baileys et MongoDB.

      ⚙️ *Technos utilisées*
        - Runtime  : Node.js 18+
        - WA API   : @whiskeysockets/baileys
        - Base de données : MongoDB Atlas
        - Hébergement : Koyeb

      👨‍💻 *Auteur*
        • Nom    : Prad
        • GitHub : https://github.com/PradSonkeng/Prad.Bot
        • Contact : wa.me/237658130830


      📌 *Préfixe des commandes :* \`${bot.prefix}\`

        Tape *${bot.prefix}help* pour voir toutes les commandes.
        _Propulsé par PradBot v${bot.version}_
    `.trim();

    // Chemin vers le logo
    const logoPath = path.join(__dirname, '../../utils/LogoBot.JPEG');

    if (fs.existsSync(logoPath)) {
      // Envoyer le logo + le texte comme légende
      const imageBuffer = fs.readFileSync(logoPath);
      await sock.sendMessage(jid, {
        image:   imageBuffer,
        caption: menu,
      });
    } else {
      // Fallback texte si logo absent
      await sock.sendMessage(jid, { text: menu });
    }

    await sendText(sock, jid, menu);
  },
};