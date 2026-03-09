'use strict';
const mongoose = require('mongoose');
const { db }   = require('../config/config');
const logger   = require('../utils/logger');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(db.uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }); 
    isConnected = true;
    logger.info('✅ MongoDB connecté');
  } catch (err) {
    logger.error('❌ Erreur MongoDB :', err);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('⚠️  MongoDB déconnecté — reconnexion...');
  setTimeout(connectDB, 3000);
});

module.exports = { connectDB };