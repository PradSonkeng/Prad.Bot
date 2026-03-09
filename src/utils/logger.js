const pino = require('pino');
const path = require('path');
const fs   = require('fs');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logger = pino({
  level: 'info',
  transport: {
    targets: [
      { target: 'pino-pretty', options: { colorize: true }, level: 'info' },
      {
        target: 'pino/file',
        options: { destination: path.join(logsDir, 'bot.log') },
        level: 'warn',
      },
    ],
  },
});

module.exports = logger;