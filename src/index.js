'use strict';

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const { useMongoAuthState, deleteSession, hasSession } = require('./utils/sessionStore');
const { connectDB }             = require('./database/connection');
const { handleMessage }         = require('./handlers/messageHandler');
const { registerEventHandlers } = require('./handlers/eventHandler');
const { bot }            = require('./config/config');
const logger                    = require('./utils/logger');
const express                   = require('express');
const qrcode                    = require('qrcode');
const fs                        = require('fs');
const path                      = require('path');


// ─── Dossiers nécessaires (temp + logs seulement) ────────────────────────────
const TEMP_DIR = path.join(__dirname, '../temp');
const LOGS_DIR = path.join(__dirname, '../logs');
[TEMP_DIR, LOGS_DIR].forEach(p => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
})

// ─── État global partagé entre le bot et le serveur web ──────────────────────
const state = {
  qr:        null,       // QR code en base64
  connected: false,      // Bot connecté ?
  botName:   bot.name,
  version:   bot.version,
  hasSession: false,
  lastError: null,       // Dernière erreur rencontrée
};

let sock = null;          // socket globale pour pouvoir la fermer proprement
let isRestarting = false; // évite les redémarrages en double

// ═════════════════════════════════════════════════════════════════════════════
// SERVEUR WEB EXPRESS — Page QR code
// ═════════════════════════════════════════════════════════════════════════════
function startWebServer() {
  const app  = express();
  const PORT = process.env.PORT || 3000;
  
  app.use(express.json());

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

    h1 { font-size: 22px; font-weight: 700; color: #25d366; margin-bottom: 4px; }
    .version { font-size: 13px; color: #555; margin-bottom: 28px; }
    #waiting, #qr-box, #connected-box, #error-box {
      display: none; flex-direction: column; align-items: center; gap: 14px;
    }
    .spinner {
      width: 44px; height: 44px;
      border: 4px solid #222; border-top-color: #25d366;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #qr-img {
      width: 250px; height: 250px; border-radius: 14px;
      border: 4px solid #25d366; padding: 6px; background: #fff;
    }
    .instructions {
      background: #1a1a1a; border-radius: 12px; padding: 14px;
      text-align: left; font-size: 13px; color: #aaa; line-height: 1.7; width: 100%;
    }

    .instructions span { color: #25d366; font-weight: 600; }
    .timer { font-size: 13px; color: #555; }
    .timer b { color: #f59e0b; }
    .check {
      width: 72px; height: 72px; background: #25d366; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 36px; animation: pop 0.4s ease;
    @keyframes pop {
      0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); }
    }
    .connected-text { font-size: 18px; font-weight: 700; color: #25d366; }
    .connected-sub { font-size: 13px; color: #666; }
    .badge {
      background: #1a2e1a; border: 1px solid #25d366; border-radius: 20px;
      padding: 5px 14px; font-size: 12px; color: #25d366;
    }
    .btn {
      margin-top: 12px; padding: 10px 20px; border-radius: 10px;
      border: none; font-size: 13px; font-weight: 600; cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-secondary { background: #222; color: #aaa; border: 1px solid #333; }
    .error-msg { color: #f87171; font-size: 13px; background: #1f1212;
                 padding: 12px; border-radius: 10px; width: 100%; }
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
      <p style="color:#555;font-size:14px;">Initialisation...</p>
    </div>

    <div id="qr-box">
      <img id="qr-img" src="" alt="QR Code"/>
      <div class="instructions">
        <span>1.</span> Ouvrez WhatsApp → ⋮ → <b>Appareils liés</b><br/>
        <span>2.</span> Appuyez sur <b>Lier un appareil</b><br/>
        <span>3.</span> Scannez ce QR code <b>rapidement</b>
      </div>
      <p class="timer">⏳ Expire dans <b id="countdown">60</b>s</p>
      <button class="btn btn-danger" onclick="forceReset()">🔄 Forcer nouvelle session</button>
    </div>

   <div id="connected-box">
      <div class="check">✓</div>
      <p class="connected-text">Bot connecté !</p>
      <p class="connected-sub">Session sauvegardée dans MongoDB</p>
      <span class="badge">🟢 En ligne</span>
      <button class="btn btn-secondary" onclick="forceReset()" style="margin-top:18px">
        Déconnecter & nouveau QR
      </button>
    </div>

    <div id="error-box">
      <p class="error-msg" id="error-text">Erreur de connexion</p>
      <button class="btn btn-danger" onclick="forceReset()">🔄 Réessayer</button>
    </div>
  </div>

  <script>
    let countdown = 60;
    let timer = null;

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

    function show(id) {
      ['waiting','qr-box','connected-box','error-box'].forEach(x => {
        document.getElementById(x).style.display = (x === id) ? 'flex' : 'none';
      });
    }

    async function forceReset() {
      if (!confirm('Supprimer la session actuelle et générer un nouveau QR ?')) return;
      try {
        await fetch('/reset-session', { method: 'POST' });
        show('waiting');
      } catch (e) {
        alert('Erreur lors de la réinitialisation');
      }
    }

    async function poll() {
      try {
        const res  = await fetch('/status');
        const data = await res.json();

        if (data.connected) {
          show('connected-box');
          clearInterval(timer);
        } else if (data.qr) {
          const img = document.getElementById('qr-img');
          if (img.src !== data.qr) {
            img.src = data.qr;
            show('qr-box');
            startTimer();
          }
        } else if (data.lastError) {
          document.getElementById('error-text').textContent = data.lastError;
          show('error-box');
        } else {
          show('waiting');
        }
      } catch (e) {}
      setTimeout(poll, 2000);
    }
    poll();
  </script>
</body>
</html>`);
  });

  // API état
  app.get('/status', (req, res) => {
    res.json({
      connected:  state.connected,
      qr:         state.qr,
      botName:    state.botName,
      version:    state.version,
      hasSession: state.hasSession,
      lastError:  state.lastError,
    });
  });

  // Healthcheck (utile pour Koyeb + auto-ping)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', connected: state.connected });
  });

  // Force reset session (bouton sur la page)
  app.post('/reset-session', async (req, res) => {
    try {
      await deleteSession();
      state.qr = null;
      state.connected = false;
      state.hasSession = false;
      state.lastError = null;

      // Redémarre proprement le bot
      if (sock) {
        try { sock.end(undefined); } catch (_) {}
        sock = null;
      }
      setTimeout(() => startBot(true), 1500);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log(`║  🌐 Page QR : http://localhost:${PORT}            ║`);
    console.log('╚══════════════════════════════════════════════╝\n');
  });

  // Auto-ping anti-sommeil Koyeb
  const APP_URL = process.env.APP_URL || '';
  if (APP_URL) {
    setInterval(async () => {
      try {
        await require('axios').get(`${APP_URL}/health`);
      } catch (_) {}
    }, 14 * 60 * 1000);
  }
}
// ═════════════════════════════════════════════════════════════════════════════
// BOT WHATSAPP
// ═════════════════════════════════════════════════════════════════════════════
async function startBot(forceNew = false) {
  if (isRestarting && !forceNew) return;
  isRestarting = true;

  try {
    await connectDB();

    if (forceNew) {
      await deleteSession();
    }

    state.hasSession = await hasSession();

    const { state: authState, saveCreds } = await useMongoAuthState();

    const { version } = await fetchLatestBaileysVersion();
    logger.info(`🚀 ${bot.name} v${bot.version} — Baileys ${version.join('.')}`);

    sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys:  makeCacheableSignalKeyStore(authState.keys, logger),
      },
      logger,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      qrTimeout: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      retryRequestDelayMs: 500,
    });

    // Sauvegarde automatique à chaque update
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          state.qr = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
          state.connected = false;
          state.lastError = null;
          logger.info('📱 QR code généré — scannez rapidement');
        } catch (err) {
          logger.error('Erreur génération QR : ' + err.message);
        }
      }

      if (connection === 'open') {
        state.connected = true;
        state.qr = null;
        state.lastError = null;
        state.hasSession = true;
        isRestarting = false;
        logger.info(`✅ ${bot.name} connecté et opérationnel !`);
      }

      if (connection === 'close') {
        state.connected = false;
        state.qr = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';

        logger.warn(`⚠️ Connexion fermée — code: ${statusCode} | ${reason}`);

        // Session invalide / logged out → nouveau QR obligatoire
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          state.lastError = 'Session expirée. Nouveau scan requis.';
          await deleteSession();
          state.hasSession = false;
          setTimeout(() => startBot(true), 3000);
          return;
        }

        // Erreurs transitoires → simple reconnexion
        if (statusCode === DisconnectReason.restartRequired ||
            statusCode === 515 ||
            reason.includes('Stream Errored') ||
            reason.includes('restart required')) {
          logger.info('🔄 Restart requis — reconnexion...');
          setTimeout(() => startBot(false), 2000);
          return;
        }

        // Autres erreurs → retry avec backoff
        state.lastError = `Déconnecté (${statusCode}). Reconnexion...`;
        setTimeout(() => startBot(false), 5000);
      }
    });

    registerEventHandlers(sock);

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        handleMessage(sock, msg).catch(err =>
          logger.error('Message error: ' + err.message)
        );
      }
    });

  } catch (err) {
    logger.error('Erreur fatale startBot: ' + err.message);
    state.lastError = err.message;
    isRestarting = false;
    setTimeout(() => startBot(false), 8000);
  }
}

// ─── Démarrage ───────────────────────────────────────────────────────────────
startWebServer();
startBot().catch(err => {
  logger.error('Erreur fatale : ' + err.message);
  process.exit(1);
});
