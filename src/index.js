'use strict';

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');

const { useMongoAuthState, deleteSession, hasSession } = require('./utils/sessionStore');
const { connectDB }             = require('./database/connection');
const { handleMessage }         = require('./handlers/messageHandler');
const { registerEventHandlers } = require('./handlers/eventHandler');
const { bot }                   = require('./config/config');
const logger                    = require('./utils/logger');
const express                   = require('express');
const qrcode                    = require('qrcode');
const fs                        = require('fs');
const path                      = require('path');

const TEMP_DIR = path.join(__dirname, '../temp');
const LOGS_DIR = path.join(__dirname, '../logs');
[TEMP_DIR, LOGS_DIR].forEach(p => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const state = {
  qr:          null,
  pairingCode: null,
  connected:   false,
  botName:     bot.name,
  version:     bot.version,
  hasSession:  false,
  lastError:   null,
  status:      'init',
};

let sock = null;
let restartTimeout = null;

function startWebServer() {
  const app  = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${bot.name} — Connexion</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #0a0a0a; font-family: system-ui, sans-serif; color: #fff;
    }
    .card {
      background: #111; border: 1px solid #222; border-radius: 24px;
      padding: 36px 28px; text-align: center; max-width: 420px; width: 92%;
      box-shadow: 0 0 60px rgba(37,211,102,0.08);
    }
    h1 { font-size: 22px; font-weight: 700; color: #25d366; margin-bottom: 4px; }
    .version { font-size: 13px; color: #555; margin-bottom: 24px; }
    .box { display: none; flex-direction: column; align-items: center; gap: 14px; }
    .spinner {
      width: 44px; height: 44px; border: 4px solid #222; border-top-color: #25d366;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #qr-img {
      width: 240px; height: 240px; border-radius: 14px;
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
    }
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
      margin-top: 8px; padding: 11px 18px; border-radius: 10px;
      border: none; font-size: 13px; font-weight: 600; cursor: pointer;
      transition: opacity 0.2s; width: 100%;
    }
    .btn:hover { opacity: 0.85; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-primary { background: #25d366; color: #000; }
    .btn-secondary { background: #222; color: #aaa; border: 1px solid #333; }
    .error-msg {
      color: #f87171; font-size: 13px; background: #1f1212;
      padding: 12px; border-radius: 10px; width: 100%;
    }
    .code-display {
      font-size: 32px; font-weight: 800; letter-spacing: 6px;
      color: #25d366; background: #0d1f0d; padding: 16px 24px;
      border-radius: 14px; border: 2px dashed #25d366; font-family: monospace;
    }
    input[type=text] {
      width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #333;
      background: #1a1a1a; color: #fff; font-size: 15px; text-align: center; outline: none;
    }
    input:focus { border-color: #25d366; }
    .hint { font-size: 12px; color: #666; margin-top: 4px; }
    .tabs { display: flex; gap: 8px; width: 100%; margin-bottom: 8px; }
    .tab {
      flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #333;
      background: #1a1a1a; color: #888; cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .tab.active { background: #25d366; color: #000; border-color: #25d366; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${bot.name}</h1>
    <p class="version">v${bot.version} — WhatsApp Bot</p>

    <div id="waiting" class="box">
      <div class="spinner"></div>
      <p style="color:#555;font-size:14px;">Initialisation...</p>
    </div>

    <div id="auth-box" class="box">
      <div class="tabs">
        <button class="tab active" id="tab-qr" onclick="switchTab('qr')">QR Code</button>
        <button class="tab" id="tab-pair" onclick="switchTab('pair')">Code Pairing</button>
      </div>

      <div id="panel-qr">
        <img id="qr-img" src="" alt="QR Code"/>
        <div class="instructions">
          <span>1.</span> WhatsApp → ⋮ → <b>Appareils liés</b><br/>
          <span>2.</span> <b>Lier un appareil</b><br/>
          <span>3.</span> Scannez <b>rapidement</b>
        </div>
        <p class="timer">Expire dans <b id="countdown">60</b>s</p>
      </div>

      <div id="panel-pair" style="display:none; width:100%;">
        <div id="pair-form">
          <p style="color:#aaa;font-size:13px;margin-bottom:10px;">
            Entrez le numéro du bot (avec indicatif pays, sans +)
          </p>
          <input type="text" id="phone-input" placeholder="ex: 237612345678" />
          <p class="hint">Exemple Cameroun : 2376XXXXXXXX</p>
          <button class="btn btn-primary" onclick="requestPairing()" style="margin-top:12px">
            Générer le code
          </button>
        </div>
        <div id="pair-result" style="display:none;">
          <p style="color:#aaa;font-size:13px;">Entrez ce code dans WhatsApp :</p>
          <div class="code-display" id="pair-code">----</div>
          <div class="instructions" style="margin-top:12px;">
            <span>1.</span> WhatsApp → ⋮ → <b>Appareils liés</b><br/>
            <span>2.</span> <b>Lier un appareil</b><br/>
            <span>3.</span> Choisissez <b>Connecter avec un numéro</b><br/>
            <span>4.</span> Tapez le code ci-dessus
          </div>
        </div>
      </div>

      <button class="btn btn-danger" onclick="forceReset()" style="margin-top:16px">
        Forcer nouvelle session
      </button>
    </div>

    <div id="connected-box" class="box">
      <div class="check">OK</div>
      <p class="connected-text">Bot connecté !</p>
      <p class="connected-sub">Session sauvegardée dans MongoDB</p>
      <span class="badge">En ligne</span>
      <button class="btn btn-secondary" onclick="forceReset()" style="margin-top:18px">
        Déconnecter et nouveau QR
      </button>
    </div>

    <div id="error-box" class="box">
      <p class="error-msg" id="error-text">Erreur de connexion</p>
      <button class="btn btn-danger" onclick="forceReset()">Réessayer</button>
    </div>
  </div>

  <script>
    let countdown = 60, timer = null;

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
      ['waiting','auth-box','connected-box','error-box'].forEach(x => {
        document.getElementById(x).style.display = (x === id) ? 'flex' : 'none';
      });
    }

    function switchTab(tab) {
      document.getElementById('tab-qr').classList.toggle('active', tab === 'qr');
      document.getElementById('tab-pair').classList.toggle('active', tab === 'pair');
      document.getElementById('panel-qr').style.display = tab === 'qr' ? 'block' : 'none';
      document.getElementById('panel-pair').style.display = tab === 'pair' ? 'block' : 'none';
    }

    async function forceReset() {
      if (!confirm('Supprimer la session et recommencer ?')) return;
      try {
        await fetch('/reset-session', { method: 'POST' });
        show('waiting');
        document.getElementById('pair-result').style.display = 'none';
        document.getElementById('pair-form').style.display = 'block';
      } catch (e) { alert('Erreur'); }
    }

    async function requestPairing() {
      const phone = document.getElementById('phone-input').value.replace(/\\D/g, '');
      if (phone.length < 10) {
        alert('Numéro invalide. Exemple : 237612345678');
        return;
      }
      try {
        const res = await fetch('/request-pairing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.code) {
          document.getElementById('pair-code').textContent = data.code.match(/.{1,4}/g).join('-');
          document.getElementById('pair-form').style.display = 'none';
          document.getElementById('pair-result').style.display = 'block';
        } else {
          alert(data.error || 'Erreur lors de la génération du code');
        }
      } catch (e) {
        alert('Erreur réseau');
      }
    }

    async function poll() {
      try {
        const res  = await fetch('/status');
        const data = await res.json();

        if (data.connected) {
          show('connected-box');
          clearInterval(timer);
        } else if (data.qr || data.pairingCode) {
          show('auth-box');
          if (data.qr) {
            const img = document.getElementById('qr-img');
            if (img.src !== data.qr) {
              img.src = data.qr;
              startTimer();
            }
          }
          if (data.pairingCode) {
            document.getElementById('pair-code').textContent =
              data.pairingCode.match(/.{1,4}/g).join('-');
            document.getElementById('pair-form').style.display = 'none';
            document.getElementById('pair-result').style.display = 'block';
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
</html>`;
    res.send(html);
  });

  app.get('/status', (req, res) => {
    res.json({
      connected:   state.connected,
      qr:          state.qr,
      pairingCode: state.pairingCode,
      botName:     state.botName,
      version:     state.version,
      hasSession:  state.hasSession,
      lastError:   state.lastError,
      status:      state.status,
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', connected: state.connected });
  });

  app.post('/reset-session', async (req, res) => {
    try {
      await deleteSession();
      state.qr = null;
      state.pairingCode = null;
      state.connected = false;
      state.hasSession = false;
      state.lastError = null;
      state.status = 'init';

      if (sock) {
        try { sock.end(undefined); } catch (_) {}
        sock = null;
      }
      clearTimeout(restartTimeout);
      setTimeout(() => startBot(true), 1200);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/request-pairing', async (req, res) => {
    try {
      const phone = (req.body.phone || '').replace(/\D/g, '');
      if (!phone || phone.length < 10) {
        return res.status(400).json({ error: 'Numéro invalide' });
      }
      if (!sock) {
        return res.status(400).json({ error: 'Bot pas encore prêt, réessayez dans 5s' });
      }
      if (sock.authState && sock.authState.creds && sock.authState.creds.registered) {
        return res.status(400).json({ error: 'Déjà connecté' });
      }

      const code = await sock.requestPairingCode(phone);
      state.pairingCode = code;
      state.status = 'pairing';
      logger.info('Pairing code généré : ' + code);
      res.json({ code });
    } catch (err) {
      logger.error('Pairing error: ' + err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  Page QR : http://localhost:' + PORT + '            ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
  });

  const APP_URL = process.env.APP_URL || '';
  if (APP_URL) {
    setInterval(async () => {
      try { await require('axios').get(APP_URL + '/health'); } catch (_) {}
    }, 14 * 60 * 1000);
  }
}

async function startBot(forceNew) {
  if (forceNew === undefined) forceNew = false;
  clearTimeout(restartTimeout);

  try {
    await connectDB();

    if (forceNew) {
      await deleteSession();
    }

    state.hasSession = await hasSession();

    const auth = await useMongoAuthState();
    const authState = auth.state;
    const saveCreds = auth.saveCreds;

    const versionInfo = await fetchLatestBaileysVersion();
    const version = versionInfo.version;
    logger.info('Démarrage ' + bot.name + ' v' + bot.version + ' — Baileys ' + version.join('.'));

    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end(undefined);
      } catch (_) {}
      sock = null;
    }

    sock = makeWASocket({
      version: version,
      auth: {
        creds: authState.creds,
        keys:  makeCacheableSignalKeyStore(authState.keys, logger),
      },
      logger: logger,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      qrTimeout: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 20000,
      retryRequestDelayMs: 400,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async function(update) {
      const connection = update.connection;
      const lastDisconnect = update.lastDisconnect;
      const qr = update.qr;

      if (qr) {
        try {
          state.qr = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
          state.connected = false;
          state.lastError = null;
          state.status = 'qr';
          logger.info('QR code généré — scannez rapidement');
        } catch (err) {
          logger.error('Erreur génération QR : ' + err.message);
        }
      }

      if (connection === 'open') {
        state.connected = true;
        state.qr = null;
        state.pairingCode = null;
        state.lastError = null;
        state.hasSession = true;
        state.status = 'connected';
        logger.info(bot.name + ' connecté et opérationnel !');
        console.log('✅ ' + bot.name + ' CONNECTÉ ET OPÉRATIONNEL')
      }

      if (connection === 'close') {
        state.connected = false;
        state.qr = null;

        var statusCode = null;
        var reason = 'Unknown';
        if (lastDisconnect && lastDisconnect.error) {
          if (lastDisconnect.error.output) {
            statusCode = lastDisconnect.error.output.statusCode;
          }
          reason = lastDisconnect.error.message || 'Unknown';
        }

        logger.warn('Connexion fermée — code: ' + statusCode + ' | ' + reason);

        // Après scan QR / pairing → WhatsApp force un restart (NORMAL)
        if (
          statusCode === DisconnectReason.restartRequired ||
          statusCode === 515 ||
          (reason && (reason.indexOf('Stream Errored') !== -1 || reason.indexOf('restart required') !== -1))
        ) {
          logger.info('Restart requis (normal après scan) — reconnexion...');
          state.status = 'init';
          restartTimeout = setTimeout(function() { startBot(false); }, 1500);
          return;
        }

        // Session invalide
        if (
          statusCode === DisconnectReason.loggedOut ||
          statusCode === 401 ||
          statusCode === 403
        ) {
          state.lastError = 'Session expirée. Nouveau scan requis.';
          state.status = 'error';
          await deleteSession();
          state.hasSession = false;
          restartTimeout = setTimeout(function() { startBot(true); }, 2500);
          return;
        }

        // Autres erreurs
        state.lastError = 'Déconnecté (' + statusCode + '). Reconnexion...';
        state.status = 'error';
        restartTimeout = setTimeout(function() { startBot(false); }, 5000);
      }
    });

    registerEventHandlers(sock);

    sock.ev.on('messages.upsert', function(payload) {
      if (payload.type !== 'notify') return;
      payload.messages.forEach(function(msg) {
        handleMessage(sock, msg).catch(function(err) {
          logger.error('Message error: ' + err.message);
        });
      });
    });

  } catch (err) {
    logger.error('Erreur fatale startBot: ' + err.message);
    state.lastError = err.message;
    state.status = 'error';
    restartTimeout = setTimeout(function() { startBot(false); }, 8000);
  }
}

startWebServer();
startBot().catch(function(err) {
  logger.error('Erreur fatale : ' + err.message);
  process.exit(1);
});
