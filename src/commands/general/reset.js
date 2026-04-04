'use strict';
const { sendText } = require('../../utils/messageUtils');

// Stocke les messages supprimés en mémoire
const deletedMessages = new Map();

// Exporter l'objet complet avec la Map pour que eventHandler puisse y accéder
module.exports = {
    // Exposé pour d'autres modules
    savedeleted: deletedMessages,

    name: 'reset',
    aliases: ['aintidelete', 'recall'],
    description: 'Affiche le dernier message supprimé dans le chat',
    category: 'general',

    async execute({ sock, jid }) {
        const saved = deletedMessages.get(jid);
        if (!saved) {
            return sendText(sock, jid, 'Aucun message supprimé trouvé pour ce chat.');
        }

        const { text, sender, time } = saved;
        const date = new Date(time).toLocaleTimeString('fr-FR');
        await sendText(
            sock,
            jid,
            `🗑️ *Message supprimé détecté*\n\n` +
                `👤 *Auteur:* @${sender.split('@')[0]}\n` +
                `🕐 *Heure:* ${date}\n` +
                `💬 *Message:* ${text || '(média ou message non textuel)'}`
        );
    },
};