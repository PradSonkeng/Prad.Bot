/**
 * Envoie un message texte simple.
 */
async function sendText(sock, jid, text) {
  return sock.sendMessage(jid, { text });
}

/**
 * Envoie une image avec légende optionnelle.
 */
async function sendImage(sock, jid, buffer, caption = '') {
  return sock.sendMessage(jid, { image: buffer, caption });
}

/**
 * Envoie une vidéo avec légende optionnelle.
 */
async function sendVideo(sock, jid, buffer, caption = '') {
  return sock.sendMessage(jid, { video: buffer, caption });
}

/**
 * Envoie un sticker.
 */
async function sendSticker(sock, jid, buffer) {
  // Ensure mimetype for webp so animated webp stickers are recognized correctly
  return sock.sendMessage(jid, { sticker: buffer, mimetype: 'image/webp' });
}

/**
 * Envoie un message audio.
 */
async function sendAudio(sock, jid, buffer, ptt = false) {
  return sock.sendMessage(jid, { audio: buffer, ptt });
}

/**
 * Réagit à un message.
 */
async function react(sock, msg, emoji) {
  return sock.sendMessage(msg.key.remoteJid, {
    react: { text: emoji, key: msg.key },
  });
}

/**
 * Extrait le texte brut d'un message (texte, image caption, etc.)
 */
function getMessageText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

/**
 * Retourne le type de message
 */
function getMessageType(msg) {
  if (!msg.message) return null;
  return Object.keys(msg.message)[0];
}

module.exports = {
  sendText, sendImage, sendVideo,
  sendSticker, sendAudio, react,
  getMessageText, getMessageType,
};