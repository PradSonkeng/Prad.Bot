require('dotenv').config();

module.exports = {
  bot: {
    name:    process.env.BOT_NAME    || 'Prad$Bot',
    version: process.env.BOT_VERSION || '2.0.0',
    prefix:  process.env.BOT_PREFIX  || '||',
    owner:   process.env.OWNER_NUMBER + '672039320',
  },
  db: {
    uri: process.env.MONGO_URI || 'mongodb+srv://user:pass@cluster.mongodb.net/whatsapp_bot',
  },
  rateLimit: {
    max:    parseInt(process.env.RATE_LIMIT_MAX)    || 20,
    window: parseInt(process.env.RATE_LIMIT_WINDOW) || 10000,
  },
  paths: {
    temp: './temp',
    logs: './logs',
    auth: './auth_info_baileys',
  },
};