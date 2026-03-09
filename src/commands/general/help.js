'use strict';

const { bot }      = require('../../config/config');
const { sendText } = require('../../utils/messageUtils');

module.exports = {
  name: 'help',
  aliases: ['aide', 'h'],
  description: 'Affiche toutes les commandes disponibles',
  category: 'general',

  async execute({ sock, jid }) {
    // Chargement du registre ici (évite la dépendance circulaire)
    const registry = require('../index');

    const categories = {};
    const seen       = new Set();

    for (const [, cmd] of registry) {
      if (seen.has(cmd.name)) continue;
      seen.add(cmd.name);
      const cat = cmd.category || 'general';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(cmd);
    }

    const icons = { general: '🌐', admin: '🛡️', media: '🎬' };
    let text = `📋 *Commandes — ${bot.name} v${bot.version}*\n`;
    text    += `Préfixe : \`${bot.prefix}\`\n\n`;

    for (const [cat, cmds] of Object.entries(categories)) {
      text += `${icons[cat] || '📌'} *${cat.toUpperCase()}*\n`;
      for (const cmd of cmds) {
        text += `  • \`${bot.prefix}${cmd.name}\` — ${cmd.description || '-'}\n`;
      }
      text += '\n';
    }

    await sendText(sock, jid, text.trim());
  },
};