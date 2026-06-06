'use strict';

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const { saveSession, loadSession, updateSessionStatus, deleteSession } = require('./utils/sessionStore');
const { connectDB }             = require('./database/connection');
const { handleMessage }         = require('./handlers/messageHandler');
const { registerEventHandlers } = require('./handlers/eventHandler');
const { bot, paths }            = require('./config/config');
const logger                    = require('./utils/logger');
const PQueue                    = require('p-queue').default;
const express                   = require('express');
const qrcode                    = require('qrcode');
const fs                        = require('fs');


// ─── File d'attente messages ──────────────────────────────────────────────────
const queue = new PQueue({ concurrency: 15 });

// ─── Dossiers nécessaires ─────────────────────────────────────────────────────
[paths.temp, paths.logs, paths.auth].forEach(p => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ─── État global partagé entre le bot et le serveur web ──────────────────────
const state = {
  qr:        null,       // QR code en base64
  connected: false,      // Bot connecté ?
  botName:   bot.name,
  version:   bot.version,
  lastError: null,       // Dernière erreur rencontrée
  startTime: Date.now(), // Timestamp du démarrage du bot
};

// ─── Gestion des reconnexions (backoff exponentiel) ──────────────────────────
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 15; // 15 minutes
const BASE_RECONNECT_DELAY = 2000; // 2 secondes
let botInstance = null;

function calculateBackoffDelay(attempt) {
  // Backoff exponentiel avec jitter: 2s, 4s, 8s, 16s, ... jusqu'à 60s max
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), 60000);
  const jitter = Math.random() * 1000; // Ajout de 0-1s de jitter pour éviter les reconnections simultanées
  return Math.floor(delay + jitter);
}

// ═════════════════════════════════════════════════════════════════════════════
// SERVEUR WEB EXPRESS — Page QR code
// ═════════════════════════════════════════════════════════════════════════════
function startWebServer() {
  const app  = express();
  const PORT = process.env.PORT || 3000;

  app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${bot.name} — Connexion</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      font-family: 'Segoe UI', sans-serif;
      color: #fff;
    }

    .card {
      background: #111;
      border: 1px solid #222;
      border-radius: 24px;
      padding: 48px 40px;
      text-align: center;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 0 60px rgba(37,211,102,0.08);
    }

    .logo {
      width: 30px;          /* Largeur fixe */
      height: 30px;         /* Hauteur identique pour un carré parfait */
      border-radius: 50%;   /* C'est ce qui rend l'image ronde */
      object-fit: cover;
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #25d366;
      margin-bottom: 4px;
    }

    .version {
      font-size: 13px;
      color: #555;
      margin-bottom: 32px;
    }

    /* ── État : En attente du QR ── */
    #waiting {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #222;
      border-top-color: #25d366;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── État : QR disponible ── */
    #qr-box { display: none; flex-direction: column; align-items: center; gap: 16px; }

    #qr-box img {
      width: 260px;
      height: 260px;
      border-radius: 16px;
      border: 4px solid #25d366;
      padding: 8px;
      background: #fff;
    }

    .instructions {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 16px;
      text-align: left;
      font-size: 13px;
      color: #aaa;
      line-height: 1.8;
      width: 100%;
    }

    .instructions span { color: #25d366; font-weight: 600; }

    .timer {
      font-size: 13px;
      color: #555;
    }

    .timer b { color: #f59e0b; }

    /* ── État : Connecté ── */
    #connected-box {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .check {
      width: 80px;
      height: 80px;
      background: #25d366;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      animation: pop 0.4s ease;
    }

    @keyframes pop {
      0%   { transform: scale(0); }
      70%  { transform: scale(1.2); }
      100% { transform: scale(1); }
    }

    .connected-text {
      font-size: 20px;
      font-weight: 700;
      color: #25d366;
    }

    .connected-sub {
      font-size: 14px;
      color: #666;
    }

    .badge {
      background: #1a2e1a;
      border: 1px solid #25d366;
      border-radius: 20px;
      padding: 6px 16px;
      font-size: 13px;
      color: #25d366;
    }
    
    .error-box {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .error-icon {
      width: 80px;
      height: 80px;
      background: #ef4444;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
    }

    .error-text {
      font-size: 20px;
      font-weight: 700;
      color: #ef4444;
    }

    .uptime {
      font-size: 12px;
      color: #666;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <img src="utils/LogoBot.JPEG" alt="Logo Bot" class="logo">
    <h1>${bot.name}</h1>
    <p class="version">v${bot.version} — WhatsApp Bot</p>

    <!-- État 1 : Chargement -->
    <div id="waiting">
      <div class="spinner"></div>
      <p style="color:#555; font-size:14px;">Génération du QR code...</p>
    </div>

    <!-- État 2 : QR disponible -->
    <div id="qr-box">
      <img id="qr-img" src="" alt="QR Code"/>
      <div class="instructions">
        <span>1.</span> Ouvrez WhatsApp sur votre téléphone<br/>
        <span>2.</span> Appuyez sur ⋮ → <b>Appareils liés</b><br/>
        <span>3.</span> Appuyez sur <b>Lier un appareil</b><br/>
        <span>4.</span> Scannez ce QR code
      </div>
      <p class="timer">⏳ Expire dans <b id="countdown">60</b>s — Se régénère automatiquement</p>
    </div>

    <!-- État 3 : Connecté -->
    <div id="connected-box">
      <div class="check">✓</div>
      <p class="connected-text">Bot connecté !</p>
      <p class="connected-sub">Le bot est actif et répond aux commandes</p>
      <span class="badge">🟢 En ligne</span>
    </div>
  </div>

  <!-- État 4 : Erreur -->
    <div id="error-box" class="error-box">
      <div class="error-icon">⚠️</div>
      <p class="error-text">Erreur de connexion</p>
      <p class="connected-sub" id="error-msg">Le bot aura besoin de quelques secondes pour se reconnecter...</p>
      <span class="badge" style="background: #7f1d1d; border-color: #ef4444; color: #ef4444;">🔴 Hors ligne</span>
    </div>

    <div class="uptime">Uptime: <span id="uptime">00:00:00</span></div>
  </div>

  <script>
    let countdown = 60;
    let timer     = null;
    let uptimeInterval = null;

    function formatUptime(ms) {
      const totalSec = Math.floor(ms / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      return \`\${String(hours).padStart(2, '0')}:\${String(mins).padStart(2, '0')}:\${String(secs).padStart(2, '0')}\`;
    }

    function startTimer() {
      countdown = 60;
      clearInterval(timer);
      timer = setInterval(() => {
        countdown--;
        const el = document.getElementById('countdown');
        if (el) el.textContent = countdown;
        if (countdown <= 0) clearInterval(timer);
      }, 1000);
    }
    
    function updateUptime() {
      const el = document.getElementById('uptime');
      if (el && window.startTime) {
        el.textContent = formatUptime(Date.now() - window.startTime);
      }
    }

    function showWaiting() {
      document.getElementById('waiting').style.display      = 'flex';
      document.getElementById('qr-box').style.display       = 'none';
      document.getElementById('connected-box').style.display = 'none';
      document.getElementById('error-box').style.display = 'none';
    }

    function showQR(src) {
      document.getElementById('waiting').style.display      = 'none';
      document.getElementById('qr-box').style.display       = 'flex';
      document.getElementById('connected-box').style.display = 'none';
      document.getElementById('error-box').style.display = 'none';
      document.getElementById('qr-img').src                 = src;
      startTimer();
    }

    function showConnected() {
      document.getElementById('waiting').style.display      = 'none';
      document.getElementById('qr-box').style.display       = 'none';
      document.getElementById('connected-box').style.display = 'flex';
      document.getElementById('error-box').style.display = 'none';
      clearInterval(timer);
    }
    
    function showError(msg) {
      document.getElementById('waiting').style.display = 'none';
      document.getElementById('qr-box').style.display = 'none';
      document.getElementById('connected-box').style.display = 'none';
      document.getElementById('error-box').style.display = 'flex';
      document.getElementById('error-msg').textContent = msg || 'Le bot aura besoin de quelques secondes pour se reconnecter...';
    }

    // ── Polling toutes les 2s pour récupérer l'état du bot ──
    async function poll() {
      try {
        const res  = await fetch('/status');
        const data = await res.json();

        window.startTime = data.startTime;
        updateUptime();

        if (data.connected) {
          showConnected();
        } else if (data.qr) {
          // Afficher seulement si le QR a changé
          const img = document.getElementById('qr-img');
          if (img.src !== data.qr) showQR(data.qr);
        } else if (data.lastError) {
          showError(\`Erreur: \${data.lastError}\`);
        } else {
          showWaiting();
        }
      } catch (e) {
        // Serveur momentanément indispo — réessayer
        console.error('Poll error:', e);
      }
      setTimeout(poll, 2000);
    }

    uptimeInterval = setInterval(updateUptime, 1000);
    poll();
  </script>
</body>
</html>
    `);
  });

  // ── API état du bot (interrogée toutes les 2s par le navigateur) ──
  app.get('/status', (req, res) => {
    res.json({
      connected: state.connected,
      qr:        state.qr,
      botName:   state.botName,
      version:   state.version,
      lastError: state.lastError,
      startTime: state.startTime,
      uptime: Date.now() - state.uptime,
    });
  });

  // ── Health check ──
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: Date.now() - state.startTime });
  });

  app.listen(PORT, () => {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════╗');
    console.log(`║  🌐 Page QR Code disponible sur :            ║`);
    console.log(`║     http://localhost:${PORT}                   ║`);
    console.log('║  Ouvrez cette URL dans votre navigateur      ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('\n');
  });

  // ----------- auto-ping pour eviter la mise en veille koyep ---------
  const APP_URL = process.env.APP_URL || '';
  if (APP_URL) {
    setInterval(async () => {
      try {
        await require('axios').get(`${APP_URL}/status`, { timeout: 5000 });
        logger.info('🔔 Ping réussi pour maintenir le bot éveillé');
      } catch (_) {}
    }, 15 * 60 * 1000); // Toutes les 15 minutes
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BOT WHATSAPP
// ═════════════════════════════════════════════════════════════════════════════
async function startBot() {
 try {
   await connectDB();

  // ── TOUJOURS useMultiFileAuthState pour les keys Signal ───────────────────
  const { state: authState, saveCreds } = await useMultiFileAuthState(paths.auth);

  // ── Restaurer les creds + keys depuis MongoDB si disponibles ────────────────────
  const savedData = await loadSession();
  if (savedData?.creds?.me?.id) {
    Object.assign(authState.creds, savedData.creds);
    if(savedData.keys) {
      Object.assign(authState.keys, savedData.keys);
    }
    logger.info(`✅ Session restaurée depuis MongoDB (${savedData.creds.me.id})`);
  } else {
    logger.info('📱 Pas de session valide — nouveau QR requis');
    state.lastError = 'Pas de session enrégistrée';
  }

  const { version } = await fetchLatestBaileysVersion();
  logger.info(`🚀 Démarrage ${bot.name} v${bot.version} — Baileys ${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: {
      creds: authState.creds,
      keys:  makeCacheableSignalKeyStore(authState.keys, logger), // ← keys fichier local
    },
    logger,
    browser: ['Ubuntu', 'Chrome', '120.0'],
    markOnlineOnConnect:            true,
    syncFullHistory:                false,
    generateHighQualityLinkPreview: false,
    qrTimeout:                      60000,
    connectTimeoutMs:               15000,
    defaultQueryTimeoutMs:          60000,
  });

  botInstance = sock;

  // ── Sauvegarder creds dans MongoDB + fichier local ────────────────────────
  sock.ev.on('creds.update', async () => {
    saveCreds();
    try {
      await saveSession( authState, authState.creds?.me?.id);
    } catch (err) {
      logger.error(`Erreur saveSession: ${err.message}`);
    }
  });

  // ── Gestion des mises à jour de connexion ──
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // QR généré
    if (qr) {
      try {
        state.qr        = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        state.connected = false;
        state.lastError = null;
        logger.info('📱 QR code généré — scannez avec WhatsApp');
      } catch (err) {
        logger.error(`Erreur génération QR: ${err.message}`);
        state.lastError = 'Erreur QR';
      }
    }

    // Connexion établie
    if (connection === 'open') {
      state.connected = true;
      state.qr        = null;
      state.lastError = null;
      reconnectAttempts = 0;
      await updateSessionStatus('connected');
      logger.info(`✅ ${bot.name} connecté et opérationnel !`);
    }

    // Connexion fermée
    if (connection === 'close') {
      state.connected = false;
      state.qr        = null;
      await updateSessionStatus('disconnected');
      
      const statusCode   = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || '';
      const errorDesc = `${statusCode || 'UNKNOWN'}: ${reason}`;

      logger.warn(`❌ Connexion fermée (${errorDesc})`);

      //Diagnostic
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const is515 = reason.includes('515') || reason.includes('Stream Errored');
      const isConnectionFailure = reason.includes('Connection Failure');

      if (isLoggedOut) {
        logger.warn('❌ Session expirée — nouveau QR requis.');
        state.lastError = 'Session expirée';
        reconnectAttempts = 0;// Reset pour forcer nouveau QR

        try {
          await deleteSession();
        } catch (err) {
          logger.error(`Erreur suppression session: ${err.message}`);
        }

        try {
          fs.rmSync(paths.auth, { recursive: true, force: true });
        } catch (_) {}
      } else if (is515) {
        logger.info('🔄 Restart WhatsApp (515) — reconnexion immédiate...');
      } else if (isConnectionFailure) {
        logger.warn('⚠️ Erreur WebSocket/Network');
        state.lastError = 'Erreur réseau';
      }

      //Backoff exponentiel
      if(reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logger.error(`❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) atteint. Arrêt.`);
        state.lastError = 'Impossible de se reconnecter';
        process.exit(1);
      }

      const delay = calculateBackoffDelay(reconnectAttempts) ;
      reconnectAttempts++;
      logger.info(`🔄 Reconnexion dans ${Math.round(delay / 1000)}s (tentative ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(startBot, delay);
    }
  });

  // ── Enregistre les autres event handlers ──
  registerEventHandlers(sock);

  // ── Traitement des messages ──
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      queue.add(() => 
        handleMessage(sock, msg).catch(err => {
          logger.error(`Message error: ${err.message}`);
        })
      );
    }
  });
 } catch (err) {
  logger.error(`Erreur fatale startBot: ${err.message}`);
  state.lastError = `Erreur: ${err.message}`;
  reconnectAttempts++;

  const delay = calculateBackoffDelay(reconnectAttempts);
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    logger.info(`🔄 Retry dans ${Math.round(delay / 1000)}s...`);
    setTimeout(startBot, delay);
  } else {
    logger.error(`❌ Erreur fatale après ${MAX_RECONNECT_ATTEMPTS} tentatives`);
    process.exit(1);
  }
 }
}

// ─── Démarrage simultané du serveur web et du bot ────────────────────────────
startWebServer();
startBot().catch(err => {
  logger.error(`Erreur initialisationBot: ${err.message}`);
  process.exit(1);
});

//─── Graceful shutdown ──
process.on('SIGINT', async () => {
  logger.info('📴 Arrêt gracieux du bot...');
  if (botInstance) {
    try {
      await botInstance.logout()
    } catch (_) {}
  }
  process.exit(0);
});