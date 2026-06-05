'use strict';
const mongoose = require('mongoose');
const { db } = require('../config/config');
const logger = require('../utils/logger');

let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(db.uri, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      retryReads: true,
      maxPoolSize: 5,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
    });

    isConnected = true;
    reconnectAttempts = 0;
    logger.info('✅ MongoDB connecté');
  } catch (err) {
    reconnectAttempts++;
    const errMsg = err.message || 'Erreur inconnue';
    logger.error(`❌ MongoDB (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}): ${errMsg}`);

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error('❌ Max reconnections atteint. Arrêt.');
      process.exit(1);
    }

    setTimeout(connectDB, RECONNECT_DELAY);
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('⚠️ MongoDB déconnecté');
  setTimeout(connectDB, RECONNECT_DELAY);
});

mongoose.connection.on('error', (err) => {
  logger.error(`❌ MongoDB error: ${err.message}`);
  isConnected = false;
});

module.exports = { connectDB };
