'use strict';

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const { saveSession, loadSession } = require('./utils/sessionStore');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
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
};

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
  </style>
</head>
<body>
  <div class="card">
    <img src="./utils/LogoBot.JPEG" alt="Logo Bot" class="logo">
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

  <script>
    let countdown = 60;
    let timer     = null;

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

    function showWaiting() {
      document.getElementById('waiting').style.display      = 'flex';
      document.getElementById('qr-box').style.display       = 'none';
      document.getElementById('connected-box').style.display = 'none';
    }

    function showQR(src) {
      document.getElementById('waiting').style.display      = 'none';
      document.getElementById('qr-box').style.display       = 'flex';
      document.getElementById('connected-box').style.display = 'none';
      document.getElementById('qr-img').src                 = src;
      startTimer();
    }

    function showConnected() {
      document.getElementById('waiting').style.display      = 'none';
      document.getElementById('qr-box').style.display       = 'none';
      document.getElementById('connected-box').style.display = 'flex';
      clearInterval(timer);
    }

    // ── Polling toutes les 2s pour récupérer l'état du bot ──
    async function poll() {
      try {
        const res  = await fetch('/status');
        const data = await res.json();

        if (data.connected) {
          showConnected();
        } else if (data.qr) {
          // Afficher seulement si le QR a changé
          const img = document.getElementById('qr-img');
          if (img.src !== data.qr) showQR(data.qr);
        } else {
          showWaiting();
        }
      } catch (e) {
        // Serveur momentanément indispo — réessayer
      }
      setTimeout(poll, 2000);
    }

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
    });
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
}

// ═════════════════════════════════════════════════════════════════════════════
// BOT WHATSAPP
// ═════════════════════════════════════════════════════════════════════════════
async function startBot() {
  await connectDB();

  // Charger session depuis MongoDB
  const savedCreds = await loadSession();

  // Créer un état auth compatible Baileys
  let authState = {
    creds: savedCreds || initAuthCreds(),
    keys:  {} // géré en mémoire
  };
  const { version }                     = await fetchLatestBaileysVersion();

  logger.info(`🚀 Démarrage ${bot.name} v${bot.version} — Baileys ${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: {
      creds: authState.creds,
      keys:  makeCacheableSignalKeyStore(authState.keys, logger),
    },
    logger,
    markOnlineOnConnect:            true,
    syncFullHistory:                false,
    generateHighQualityLinkPreview: false,
  });

 // Sauvegarder dans MongoDB à chaque mise à jour
  sock.ev.on('creds.update', async (update) => {
    Object.assign(authState.creds, update);
    await saveSession(authState.creds);
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

    // ── Nouveau QR généré → convertir en image base64 ──────────────────
    if (qr) {
      try {
        state.qr        = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        state.connected = false;
        logger.info('📱 QR code généré — ouvrez http://localhost:3000');
      } catch (err) {
        logger.error('Erreur génération QR :', err.message);
      }
    }

    // ── Bot connecté ───────────────────────────────────────────────────
    if (connection === 'open') {
      state.connected = true;
      state.qr        = null;
      logger.info(`✅ ${bot.name} connecté et opérationnel !`);
    }

    // ── Déconnexion ────────────────────────────────────────────────────
    if (connection === 'close') {
      state.connected = false;
      state.qr        = null;

      const code            = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      if (code === DisconnectReason.loggedOut) {
        logger.warn('❌ Session expirée. Supprimez auth_info_baileys/ et relancez.');
      } else {
        logger.warn(`⚠️ Connexion fermée (code ${code}). Reconnexion dans 5s...`);
        setTimeout(startBot, 5000);
      }
    }
  });

  registerEventHandlers(sock);

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      queue.add(() => handleMessage(sock, msg));
    }
  });
}

// ─── Démarrage simultané du serveur web et du bot ────────────────────────────
startWebServer();
startBot().catch(err => {
  logger.error('Erreur fatale : ' + err.message);
  process.exit(1);
});