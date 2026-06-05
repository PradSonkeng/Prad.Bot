'use strict';
const mongoose = require('mongoose');
const { db }   = require('../config/config');
const logger   = require('../utils/logger');

let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 3000; // 3 secondes

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
    logger.info('✅ MongoDB connecté avec succès');
  } catch (err) {
    reconnectAttempts++;
    const errrMsg = err.message || 'Erreur inconnue';
    logger.error(`❌ Erreur MongoDB (tentative ${reconnectAttempts}/${maxReconnectAttempts}) : ${errrMsg}`);
    if (reconnectAttempts >= maxReconnectAttempts) {
       logger.error('❌ Nombre maximum de tentatives de reconnexion atteint. Arrêt du processus.');
       process.exit(1);
    }
    setTimeout(connectDB, reconnectDelay);
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('⚠️  MongoDB déconnecté — reconnexion...');
  setTimeout(connectDB, reconnectDelay);
});

mongoose.connection.on('error', (err) => {
  logger.error(`❌ Erreur de connexion MongoDB : ${err.message || 'Erreur inconnue'}`);
  isConnected = false;
});

module.exports = { connectDB };