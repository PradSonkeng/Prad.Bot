const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const registry = new Map();

/**
 * Charge récursivement tous les fichiers de commandes depuis les sous-dossiers.
 * Ajouter une commande = créer un fichier dans le bon dossier. C'est tout.
 */
function loadCommands(dir = __dirname) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith('.js') && entry.name !== 'index.js') {
      try {
        const cmd = require(fullPath);
        if (cmd.name && typeof cmd.execute === 'function') {
          const names = [cmd.name, ...(cmd.aliases || [])];
          names.forEach(n => registry.set(n.toLowerCase(), cmd));
          logger.info(`✔ Commande chargée : ${bot?.prefix || '||'}${cmd.name}`);
        }
      } catch (err) {
        logger.warn(`⚠ Impossible de charger ${entry.name}: ${err.message}`);
      }
    }
  }
}

// Chargement automatique au démarrage
const { bot } = require('../config/config');
loadCommands();

module.exports = registry;