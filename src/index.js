'use strict';

const { connectDB }             = require('./database/connection');
const { bot }                   = require('./config/config');
const logger                    = require('./utils/logger');
const express                   = require('express');
const fs                        = require('fs');
const path                      = require('path');

const TEMP_DIR = path.join(__dirname, '../temp');
const LOGS_DIR = path.join(__dirname, '../logs');
[TEMP_DIR, LOGS_DIR].forEach(p => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const manager = new SessionManager();

function startWebServer() {
  const app  = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // ── Page principale : session BOT ────────────────────────────────────────
  app.get('/', function (req, res) {
    res.send(pageHtml('main'));
  });

  // ── Page utilisateurs : connecter mon WhatsApp ────────────────────────────
  app.get('/user', function (req, res) {
    res.send(pageHtml('user'));
  });
  
  // État session main
  app.get('/status', function (req, res) {
    const s = manager.get(MAIN_SESSION_ID);
    res.json({
      mode: 'main',
      connected: s ? s.status === 'connected' : false,
      qr: s ? s.qr : null,
      pairingCode: s ? s.pairingCode : null,
      phone: s ? s.phone : null,
      status: s ? s.status : 'init',
      botName: bot.name,
      version: bot.version,
    });
  });

  // État d'une session user
  app.get('/status/:sessionId', function (req, res) {
    const s = manager.get(req.params.sessionId);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    res.json({
      mode: 'user',
      sessionId: req.params.sessionId,
      connected: s.status === 'connected',
      qr: s.qr,
      pairingCode: s.pairingCode,
      phone: s.phone,
      status: s.status,
    });
  });
  
  app.get('/health', function (req, res) {
    const s = manager.get(MAIN_SESSION_ID);
    res.json({ status: 'ok', mainConnected: s ? s.status === 'connected' : false });
  });

  // Liste des sessions (admin)
  app.get('/sessions', function (req, res) {
    res.json(manager.getAll());
  });

  // Reset session principale
  app.post('/reset-session', async function (req, res) {
    try {
      await manager.resetMainSession();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Créer une session utilisateur (nouvelle connexion)
  app.post('/user/create', async function (req, res) {
    try {
      const sessionId = await manager.createUserSession();
      res.json({ sessionId: sessionId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pairing code (main ou user)
  app.post('/request-pairing', async function (req, res) {
    try {
      const phone = (req.body.phone || '').replace(/\D/g, '');
      const sessionId = req.body.sessionId || MAIN_SESSION_ID;
      if (!phone || phone.length < 10) {
        return res.status(400).json({ error: 'Numéro invalide' });
      }
      const code = await manager.requestPairingCode(sessionId, phone);
      res.json({ code: code });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Supprimer une session user
  app.post('/user/remove', async function (req, res) {
    try {
      await manager.removeSession(req.body.sessionId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  app.listen(PORT, function () {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  Bot principal : http://localhost:' + PORT + '          ║');
    console.log('║  Connexion user : http://localhost:' + PORT + '/user   ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });

  const APP_URL = process.env.APP_URL || '';
  if (APP_URL) {
    setInterval(async function () {
      try { await require('axios').get(APP_URL + '/health'); } catch (_) {}
    }, 14 * 60 * 1000);
  }
}

function pageHtml(mode) {
  const isUser = mode === 'user';
  const title = isUser ? (bot.name + ' — Connecter mon WhatsApp') : (bot.name + ' — Session Bot');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui,sans-serif;color:#fff}
    .card{background:#111;border:1px solid #222;border-radius:24px;padding:36px 28px;text-align:center;max-width:440px;width:92%;box-shadow:0 0 60px rgba(37,211,102,.08)}
    h1{font-size:20px;font-weight:700;color:#25d366;margin-bottom:4px}
    .sub{font-size:13px;color:#666;margin-bottom:20px;line-height:1.5}
    .box{display:none;flex-direction:column;align-items:center;gap:14px;width:100%}
    .spinner{width:44px;height:44px;border:4px solid #222;border-top-color:#25d366;border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    #qr-img{width:230px;height:230px;border-radius:14px;border:4px solid #25d366;padding:6px;background:#fff}
    .instructions{background:#1a1a1a;border-radius:12px;padding:14px;text-align:left;font-size:13px;color:#aaa;line-height:1.7;width:100%}
    .instructions span{color:#25d366;font-weight:600}
    .btn{margin-top:8px;padding:11px 18px;border-radius:10px;border:none;font-size:13px;font-weight:600;cursor:pointer;width:100%}
    .btn-danger{background:#dc2626;color:#fff}
    .btn-primary{background:#25d366;color:#000}
    .btn-secondary{background:#222;color:#aaa;border:1px solid #333}
    .code-display{font-size:30px;font-weight:800;letter-spacing:6px;color:#25d366;background:#0d1f0d;padding:16px 20px;border-radius:14px;border:2px dashed #25d366;font-family:monospace}
    input[type=text]{width:100%;padding:12px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:15px;text-align:center;outline:none}
    input:focus{border-color:#25d366}
    .tabs{display:flex;gap:8px;width:100%;margin-bottom:8px}
    .tab{flex:1;padding:10px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#888;cursor:pointer;font-size:13px;font-weight:600}
    .tab.active{background:#25d366;color:#000;border-color:#25d366}
    .badge{background:#1a2e1a;border:1px solid #25d366;border-radius:20px;padding:5px 14px;font-size:12px;color:#25d366}
    .check{width:72px;height:72px;background:#25d366;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#000}
    a.link{color:#25d366;font-size:13px}
  </style>
</head>
<body>
  <div class="card">
    <h1>${bot.name}</h1>
    <p class="sub">${isUser
      ? 'Connecte <b>ton</b> WhatsApp pour utiliser les commandes.<br/>Tes chats et appels restent normaux.'
      : 'Session principale du bot (numéro dédié)<br/><a class="link" href="/user">→ Connexion utilisateur</a>'}</p>

    <div id="waiting" class="box"><div class="spinner"></div><p style="color:#555;font-size:14px">Préparation...</p></div>

    <div id="auth-box" class="box">
      <div class="tabs">
        <button class="tab active" id="tab-qr" onclick="switchTab('qr')">QR Code</button>
        <button class="tab" id="tab-pair" onclick="switchTab('pair')">Code Pairing</button>
      </div>
      <div id="panel-qr">
        <img id="qr-img" src="" alt="QR"/>
        <div class="instructions">
          <span>1.</span> WhatsApp → ⋮ → <b>Appareils liés</b><br/>
          <span>2.</span> <b>Lier un appareil</b><br/>
          <span>3.</span> Scannez rapidement
        </div>
      </div>
      <div id="panel-pair" style="display:none;width:100%">
        <div id="pair-form">
          <p style="color:#aaa;font-size:13px;margin-bottom:10px">Numéro ${isUser ? 'de ton WhatsApp' : 'du bot'} (indicatif, sans +)</p>
          <input type="text" id="phone-input" placeholder="ex: 237612345678"/>
          <button class="btn btn-primary" onclick="requestPairing()" style="margin-top:12px">Générer le code</button>
        </div>
        <div id="pair-result" style="display:none">
          <p style="color:#aaa;font-size:13px">Code à entrer dans WhatsApp :</p>
          <div class="code-display" id="pair-code">----</div>
          <div class="instructions" style="margin-top:12px">
            <span>1.</span> Appareils liés → Lier un appareil<br/>
            <span>2.</span> <b>Connecter avec un numéro</b><br/>
            <span>3.</span> Tape le code
          </div>
        </div>
      </div>
      ${isUser ? '' : '<button class="btn btn-danger" onclick="forceReset()" style="margin-top:16px">Forcer nouvelle session bot</button>'}
    </div>

    <div id="connected-box" class="box">
      <div class="check">OK</div>
      <p style="font-size:18px;font-weight:700;color:#25d366">${isUser ? 'WhatsApp connecté !' : 'Bot connecté !'}</p>
      <p style="font-size:13px;color:#666" id="phone-label"></p>
      <span class="badge">En ligne</span>
      <p style="font-size:12px;color:#555;margin-top:8px">${isUser
        ? 'Envoie une commande avec le préfixe <b>' + bot.prefix + '</b> (ex: ' + bot.prefix + 'menu)'
        : 'Session principale active'}</p>
    </div>
  </div>
  <script>
    const MODE = '${mode}';
    let sessionId = null;
    let timer = null;

    function show(id) {
      ['waiting','auth-box','connected-box'].forEach(function(x){
        document.getElementById(x).style.display = (x === id) ? 'flex' : 'none';
      });
    }
    function switchTab(tab) {
      document.getElementById('tab-qr').classList.toggle('active', tab==='qr');
      document.getElementById('tab-pair').classList.toggle('active', tab==='pair');
      document.getElementById('panel-qr').style.display = tab==='qr' ? 'block' : 'none';
      document.getElementById('panel-pair').style.display = tab==='pair' ? 'block' : 'none';
    }
    async function forceReset() {
      if (!confirm('Nouvelle session bot ?')) return;
      await fetch('/reset-session', { method: 'POST' });
      show('waiting');
    }
    async function requestPairing() {
      const phone = document.getElementById('phone-input').value.replace(/\D/g,'');
      if (phone.length < 10) { alert('Numéro invalide'); return; }
      if (MODE === 'user' && !sessionId) { alert('Session pas prête'); return; }
      const body = { phone: phone };
      if (MODE === 'user') body.sessionId = sessionId;
      const res = await fetch('/request-pairing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.code) {
        document.getElementById('pair-code').textContent = data.code.match(/.{1,4}/g).join('-');
        document.getElementById('pair-form').style.display = 'none';
        document.getElementById('pair-result').style.display = 'block';
      } else alert(data.error || 'Erreur');
    }
    async function ensureUserSession() {
      if (MODE !== 'user') return;
      if (sessionId) return;
      const res = await fetch('/user/create', { method: 'POST' });
      const data = await res.json();
      sessionId = data.sessionId;
    }
    async function poll() {
      try {
        if (MODE === 'user') await ensureUserSession();
        const url = MODE === 'user' ? ('/status/' + sessionId) : '/status';
        const res = await fetch(url);
        const data = await res.json();
        if (data.connected) {
          show('connected-box');
          if (data.phone) document.getElementById('phone-label').textContent = '+' + data.phone;
        } else if (data.qr || data.pairingCode) {
          show('auth-box');
          if (data.qr) {
            const img = document.getElementById('qr-img');
            if (img.src !== data.qr) img.src = data.qr;
          }
          if (data.pairingCode) {
            document.getElementById('pair-code').textContent = data.pairingCode.match(/.{1,4}/g).join('-');
            document.getElementById('pair-form').style.display = 'none';
            document.getElementById('pair-result').style.display = 'block';
          }
        } else show('waiting');
      } catch(e) {}
      setTimeout(poll, 2000);
    }
    poll();
  </script>
</body>
</html>`;
}

async function main() {
  await connectDB();
  startWebServer();
  await manager.init();
  logger.info(bot.name + ' multi-sessions démarré');
}

main().catch(function (err) {
  logger.error('Erreur fatale : ' + err.message);
  process.exit(1);
});
