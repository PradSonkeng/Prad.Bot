require('dotenv').config();

module.exports = {
  bot: {
    name:    process.env.BOT_NAME    || 'Prad$Bot',
    version: process.env.BOT_VERSION || '2.0.0',
    prefix:  process.env.BOT_PREFIX  || '||',
    owner:   process.env.OWNER_NUMBER + '672039320',
  },
  db: {
    uri: process.env.MONGO_URI || 'mongodb://botuser:NouNou2003@ac-fkb7gte-shard-00-00.ollcdvg.mongodb.net:27017,ac-fkb7gte-shard-00-01.ollcdvg.mongodb.net:27017,ac-fkb7gte-shard-00-02.ollcdvg.mongodb.net:27017/?ssl=true&replicaSet=atlas-10icqh-shard-0&authSource=admin&appName=whatsapp-bot',
  },
  rateLimit: {
    max:    parseInt(process.env.RATE_LIMIT_MAX)    || 10,
    window: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
  },
  paths: {
    temp: './temp',
    logs: './logs',
    auth: './auth_info_baileys',
  },
};