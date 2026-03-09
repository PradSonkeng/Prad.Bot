const NodeCache = require('node-cache');
const { rateLimit } = require('../config/config');

const cache = new NodeCache({ stdTTL: rateLimit.window / 1000 });

/**
 * Retourne true si l'utilisateur est en limite de taux (flood).
 */
function isRateLimited(jid) {
  const key   = `rl:${jid}`;
  const count = cache.get(key) || 0;
  if (count >= rateLimit.max) return true;
  cache.set(key, count + 1, rateLimit.window / 1000);
  return false;
}

module.exports = { isRateLimited };