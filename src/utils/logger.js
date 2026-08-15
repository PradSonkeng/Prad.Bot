'use strict';

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Pas de transport worker → logs immédiats dans la console Koyeb
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Helpers visibles même si pino est filtré
logger.ok = function (msg) {
  console.log('[OK] ' + msg);
  logger.info(msg);
};
logger.fail = function (msg) {
  console.error('[ERR] ' + msg);
  logger.error(msg);
};

module.exports = logger;
