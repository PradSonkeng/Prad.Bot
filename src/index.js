'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { connectDB } = require('./database/connection');
const { bot } = require('./config/config');
const logger = require('./utils/logger');
const { SessionManager, MAIN_SESSION_ID } = require('./sessions/SessionManager');

const TEMP_DIR = path.join(__dirname, '../temp');
const LOGS_DIR = path.join(__dirname, '../logs');
[TEMP_DIR, LOGS_DIR].forEach(function (p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const manager = new SessionManager();
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

function requireAdmin(req, res, next) {
  const key = (req.headers['x-admin-secret'] || req.query.key || (req.body && req.body.key) || '').trim();
  if (!ADMIN_SECRET) {
    return res.status(503).json({ error: 'ADMIN_SECRET non configuré côté serveur' });
  }
  if (key !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Accès refusé' });
  }
  next();
}

function startWebServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Logo du bot
  app.get('/logo', function (req, res) {
    res.sendFile(path.join(__dirname, 'utils', 'LogoBot.JPEG'));
  });

  // ── Page publiques ────────────────────────────────────────
  app.get('/', function (req, res) {
    res.send(pageHtml('main'));
  });

  app.get('/user', function (req, res) {
    res.send(pageHtml('user'));
  });
  
   // ── Page admin (protégée côté client + API) ──────────────────────────────
  app.get('/admin', function (req, res) {
    res.send(adminPageHtml());
  });

  // État session main
   app.get('/status', function (req, res) {
    const s = manager.get(MAIN_SESSION_ID);
    res.json({
      mode: 'main',
      connected: !!(s && s.status === 'connected'),
      qr: s ? s.qr : null,
      pairingCode: s ? s.pairingCode : null,
      phone: s ? s.phone : null,
      status: s ? s.status : 'init',
      lastError: s ? (s.lastError || null) : null,
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
      lastError: s.lastError || null,
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
  
   // Reprendre une session user déjà liée (persistance navigateur + Mongo)
  app.post('/user/resume', async function (req, res) {
    try {
      const sessionId = req.body.sessionId;
      if (!sessionId) return res.status(400).json({ error: 'sessionId requis' });
      const info = await manager.resumeSession(sessionId);
      res.json(info);
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
      const sid = req.body.sessionId;
      if (!sid) return res.status(400).json({ error: 'sessionId requis' });
      if (sid === MAIN_SESSION_ID) return res.status(403).json({ error: 'Interdit' });
      await manager.removeSession(sid);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // ══════════════════════════════════════════════════════════════════════════
  // API ADMIN (protégées par ADMIN_SECRET)
  // ══════════════════════════════════════════════════════════════════════════
  app.get('/admin/api/sessions', requireAdmin, async function (req, res) {
    try {
      const list = await manager.getAllDetailed();
      res.json({ sessions: list, total: list.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  app.post('/admin/api/session/active', requireAdmin, async function (req, res) {
    try {
      const { sessionId, active } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId requis' });
      const result = await manager.setSessionActive(sessionId, !!active);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  app.post('/admin/api/session/remove', requireAdmin, async function (req, res) {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId requis' });
      if (sessionId === MAIN_SESSION_ID) return res.status(403).json({ error: 'Impossible de supprimer la session principale' });
      await manager.removeSession(sessionId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  app.get('/admin/api/stats', requireAdmin, async function (req, res) {
    try {
      const list = await manager.getAllDetailed();
      const users = list.filter(s => s.type === 'user');
      const totalCommands = users.reduce((a, s) => a + (s.stats.commandCount || 0), 0);
      const connected = users.filter(s => s.connected).length;
      const active = users.filter(s => s.active).length;
      const registered = users.filter(s => s.registered).length;
      res.json({
        totalSessions: list.length,
        userSessions: users.length,
        mainConnected: !!(list.find(s => s.type === 'main') || {}).connected,
        usersConnected: connected,
        usersActive: active,
        usersRegistered: registered,
        totalCommands,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  
  app.listen(PORT, function () {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  Bot principal : http://localhost:' + PORT + '          ║');
    console.log('║  Connexion user : http://localhost:' + PORT + '/user   ║');
    console.log('║  Admin panel    : http://localhost:' + PORT + '/admin  ║');
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

// ════════════════════════════════════════════════════════════════════════════
// PAGE USER / MAIN
// ════════════════════════════════════════════════════════════════════════════

function pageHtml(mode) {
  var isUser = mode === 'user';
  var sub = isUser
    ? 'Connecte <b>ton</b> WhatsApp. Tes chats restent normaux.'
    : 'Session principale du bot<br/><a class="link" href="/user">Connexion utilisateur</a>';
  var okMsg = isUser ? 'WhatsApp connecté !' : 'Bot connecté !';

  // Boutons spécifiques user (nouvelle connexion + déconnecter)
  var userActions = isUser
    ? '<div id="user-actions" style="display:none;width:100%;margin-top:16px;gap:8px;flex-direction:column">' +
      '<button class="btn btn-primary" onclick="newConnection()">Nouvelle connexion</button>' +
      '<button class="btn btn-danger" onclick="disconnectSession()">Déconnecter cette session</button>' +
      '</div>'
    : '';

  var resetBtn = isUser
    ? ''
    : '<button class="btn btn-danger" onclick="forceReset()" style="margin-top:16px">Forcer nouvelle session</button>';

  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"/>' +
    '<title>' + bot.name + '</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui,sans-serif;color:#fff}' +
    '.card{background:#111;border:1px solid #222;border-radius:24px;padding:36px 28px;text-align:center;max-width:440px;width:92%}' +
    '.logo{width:90px;height:90px;border-radius:50%;object-fit:cover;margin-bottom:16px;border:3px solid #25d366;box-shadow:0 0 20px rgba(37,211,102,.25)}' +
    'h1{font-size:20px;font-weight:700;color:#25d366;margin-bottom:4px}' +
    '.sub{font-size:13px;color:#666;margin-bottom:20px;line-height:1.5}' +
    '.box{display:none;flex-direction:column;align-items:center;gap:14px;width:100%}' +
    '.spinner{width:44px;height:44px;border:4px solid #222;border-top-color:#25d366;border-radius:50%;animation:spin .8s linear infinite}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '#qr-img{width:230px;height:230px;border-radius:14px;border:4px solid #25d366;padding:6px;background:#fff}' +
    '.instructions{background:#1a1a1a;border-radius:12px;padding:14px;text-align:left;font-size:13px;color:#aaa;line-height:1.7;width:100%}' +
    '.instructions span{color:#25d366;font-weight:600}' +
    '.btn{margin-top:8px;padding:11px 18px;border-radius:10px;border:none;font-size:13px;font-weight:600;cursor:pointer;width:100%}' +
    '.btn-danger{background:#dc2626;color:#fff}' +
    '.btn-primary{background:#25d366;color:#000}' +
    '.btn-outline{background:transparent;border:1px solid #333;color:#aaa}' +
    '.code-display{font-size:28px;font-weight:800;letter-spacing:5px;color:#25d366;background:#0d1f0d;padding:16px;border-radius:14px;border:2px dashed #25d366;font-family:monospace}' +
    'input[type=text]{width:100%;padding:12px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:15px;text-align:center}' +
    '.tabs{display:flex;gap:8px;width:100%;margin-bottom:8px}' +
    '.tab{flex:1;padding:10px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#888;cursor:pointer;font-size:13px;font-weight:600}' +
    '.tab.active{background:#25d366;color:#000;border-color:#25d366}' +
    '.badge{background:#1a2e1a;border:1px solid #25d366;border-radius:20px;padding:5px 14px;font-size:12px;color:#25d366}' +
    '.check{width:72px;height:72px;background:#25d366;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#000}' +
    'a.link{color:#25d366;font-size:13px}' +
    '.err{color:#f87171;font-size:12px;background:#1f1212;padding:10px;border-radius:10px;width:100%;word-break:break-word}' +
    '</style></head><body><div class="card">' +
    '<img class="logo" src="/logo" alt="Logo"/>' +
    '<h1>' + bot.name + '</h1>' +
    '<p class="sub">' + sub + '</p>' +
    '<div id="waiting" class="box" style="display:flex"><div class="spinner"></div>' +
    '<p style="color:#555;font-size:14px" id="wait-text">Préparation...</p>' +
    '<p style="color:#444;font-size:11px" id="wait-debug"></p></div>' +
    '<div id="auth-box" class="box">' +
    '<div class="tabs">' +
    '<button class="tab active" id="tab-qr" onclick="switchTab(\'qr\')">QR Code</button>' +
    '<button class="tab" id="tab-pair" onclick="switchTab(\'pair\')">Code Pairing</button>' +
    '</div>' +
    '<div id="panel-qr"><img id="qr-img" src="" alt="QR"/>' +
    '<div class="instructions"><span>1.</span> WhatsApp → Appareils liés<br/>' +
    '<span>2.</span> Lier un appareil<br/><span>3.</span> Scannez</div></div>' +
    '<div id="panel-pair" style="display:none;width:100%">' +
    '<div id="pair-form"><p style="color:#aaa;font-size:13px;margin-bottom:10px">Numéro (indicatif, sans +)</p>' +
    '<input type="text" id="phone-input" placeholder="ex: 237612345678"/>' +
    '<button class="btn btn-primary" onclick="requestPairing()" style="margin-top:12px">Générer le code</button></div>' +
    '<div id="pair-result" style="display:none"><p style="color:#aaa;font-size:13px">Code WhatsApp :</p>' +
    '<div class="code-display" id="pair-code">----</div></div></div>' +
    resetBtn +
    '</div>' +
    '<div id="connected-box" class="box"><div class="check">OK</div>' +
    '<p style="font-size:18px;font-weight:700;color:#25d366">' + okMsg + '</p>' +
    '<p style="font-size:13px;color:#666" id="phone-label"></p>' +
    '<span class="badge">En ligne</span>' +
    userActions +
    '</div>' +
    '<div id="error-box" class="box"><p class="err" id="error-text">Erreur</p>' +
    '<button class="btn btn-danger" onclick="forceReset()">Réessayer</button></div>' +
    '</div><script>' +
    'var MODE="' + mode + '";var sessionId=null;var pollCount=0;' +
    'function show(id){["waiting","auth-box","connected-box","error-box"].forEach(function(x){' +
    'document.getElementById(x).style.display=(x===id)?"flex":"none";});' +
    'var ua=document.getElementById("user-actions");' +
    'if(ua)ua.style.display=(id==="connected-box"&&MODE==="user")?"flex":"none";}' +
    'function switchTab(tab){' +
    'document.getElementById("tab-qr").classList.toggle("active",tab==="qr");' +
    'document.getElementById("tab-pair").classList.toggle("active",tab==="pair");' +
    'document.getElementById("panel-qr").style.display=tab==="qr"?"block":"none";' +
    'document.getElementById("panel-pair").style.display=tab==="pair"?"block":"none";}' +
    'async function forceReset(){if(!confirm("Nouvelle session ?"))return;' +
    'await fetch("/reset-session",{method:"POST"});show("waiting");}' +
    // Nouvelle connexion user : efface localStorage + crée une nouvelle session
    'async function newConnection(){' +
    'if(!confirm("Creer une NOUVELLE connexion ? La session actuelle restera active cote serveur jusqu a suppression admin."))return;' +
    'localStorage.removeItem("prad_user_session");' +
    'sessionId=null;' +
    'show("waiting");' +
    'await ensureUserSession(true);' +
    '}' +
    // Déconnecter = supprimer la session serveur + localStorage
    'async function disconnectSession(){' +
    'if(!sessionId){alert("Aucune session");return;}' +
    'if(!confirm("Déconnecter et supprimer cette session ?"))return;' +
    'try{await fetch("/user/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:sessionId})});}catch(e){}' +
    'localStorage.removeItem("prad_user_session");' +
    'sessionId=null;' +
    'show("waiting");' +
    'await ensureUserSession(true);' +
    '}' +
    'async function requestPairing(){' +
    'var phone=document.getElementById("phone-input").value.replace(/\\D/g,"");' +
    'if(phone.length<10){alert("Numéro invalide");return;}' +
    'if(MODE==="user"&&!sessionId){alert("Session pas prête");return;}' +
    'var body={phone:phone};if(MODE==="user")body.sessionId=sessionId;' +
    'var res=await fetch("/request-pairing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});' +
    'var data=await res.json();' +
    'if(data.code){document.getElementById("pair-code").textContent=data.code.match(/.{1,4}/g).join("-");' +
    'document.getElementById("pair-form").style.display="none";' +
    'document.getElementById("pair-result").style.display="block";}' +
    'else alert(data.error||"Erreur");}' +
    'async function ensureUserSession(forceNew){' +
    'if(MODE!=="user")return;' +
    'if(forceNew){sessionId=null;localStorage.removeItem("prad_user_session");}' +
    'if(sessionId)return;' +
    'var saved=localStorage.getItem("prad_user_session");' +
    'if(saved&&!forceNew){try{' +
    'var res=await fetch("/user/resume",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:saved})});' +
    'var data=await res.json();' +
    'if(res.ok&&data.sessionId){sessionId=data.sessionId;localStorage.setItem("prad_user_session",sessionId);return;}' +
    '}catch(e){localStorage.removeItem("prad_user_session");}}' +
    'var res2=await fetch("/user/create",{method:"POST"});' +
    'var data2=await res2.json();sessionId=data2.sessionId;' +
    'if(sessionId)localStorage.setItem("prad_user_session",sessionId);}' +
    'async function poll(){pollCount++;try{' +
    'if(MODE==="user")await ensureUserSession(false);' +
    'var url=MODE==="user"?("/status/"+sessionId):"/status";' +
    'var res=await fetch(url);if(!res.ok)throw new Error("HTTP "+res.status);' +
    'var data=await res.json();' +
    'var dbg=document.getElementById("wait-debug");' +
    'if(dbg)dbg.textContent="status="+(data.status||"?")+" | poll="+pollCount;' +
    'if(data.connected){show("connected-box");' +
    'if(MODE==="user"&&sessionId)localStorage.setItem("prad_user_session",sessionId);' +
    'if(data.phone)document.getElementById("phone-label").textContent="+"+data.phone;}' +
    'else if(data.qr||data.pairingCode){show("auth-box");' +
    'if(data.qr){var img=document.getElementById("qr-img");if(img.src!==data.qr)img.src=data.qr;}' +
    'if(data.pairingCode){document.getElementById("pair-code").textContent=data.pairingCode.match(/.{1,4}/g).join("-");' +
    'document.getElementById("pair-form").style.display="none";' +
    'document.getElementById("pair-result").style.display="block";}}' +
    'else if(data.lastError||data.status==="error"){' +
    'show("error-box");document.getElementById("error-text").textContent=data.lastError||"Erreur de session";}' +
    'else{show("waiting");var w=document.getElementById("wait-text");' +
    'if(w)w.textContent=pollCount<5?"Connexion WhatsApp...":"En attente ("+(data.status||"init")+")";}' +
    '}catch(e){show("waiting");var w=document.getElementById("wait-text");if(w)w.textContent="Erreur réseau";' +
    'var d=document.getElementById("wait-debug");if(d)d.textContent=String(e.message||e);}' +
    'setTimeout(poll,2000);}poll();' +
    '</script></body></html>';
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE ADMIN
// ════════════════════════════════════════════════════════════════════════════

function adminPageHtml() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${bot.name} — Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;color:#e5e5e5}
.logo{width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:14px;border:3px solid #25d366;box-shadow:0 0 18px rgba(37,211,102,.3)}
.header-logo{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #25d366;vertical-align:middle;margin-right:10px}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login-card{background:#111;border:1px solid #222;border-radius:20px;padding:36px 28px;max-width:380px;width:100%;text-align:center}
.login-card h1{color:#25d366;font-size:22px;margin-bottom:6px}
.login-card p{color:#666;font-size:13px;margin-bottom:20px}
.login-card input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:15px;margin-bottom:12px}
.login-card button{width:100%;padding:12px;border:none;border-radius:10px;background:#25d366;color:#000;font-weight:700;font-size:14px;cursor:pointer}
.err{color:#f87171;font-size:12px;margin-top:10px}
.header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #1a1a1a;background:#0d0d0d;position:sticky;top:0;z-index:10}
.header h1{font-size:18px;color:#25d366}
.header .meta{font-size:12px;color:#666}
.btn{padding:8px 14px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer}
.btn-sm{padding:6px 10px;font-size:11px}
.btn-green{background:#25d366;color:#000}
.btn-red{background:#dc2626;color:#fff}
.btn-yellow{background:#ca8a04;color:#000}
.btn-gray{background:#333;color:#ccc}
.btn-outline{background:transparent;border:1px solid #333;color:#aaa}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;padding:20px 24px}
.stat{background:#111;border:1px solid #1f1f1f;border-radius:14px;padding:16px}
.stat .label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px}
.stat .value{font-size:24px;font-weight:700;color:#25d366;margin-top:4px}
.toolbar{padding:0 24px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.toolbar input{flex:1;min-width:180px;padding:10px 12px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:13px}
.table-wrap{padding:0 24px 40px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;color:#666;font-weight:600;border-bottom:1px solid #1a1a1a;white-space:nowrap}
td{padding:12px;border-bottom:1px solid #141414;vertical-align:middle}
tr:hover td{background:#0f0f0f}
.badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:600}
.badge-on{background:#0d2818;color:#25d366;border:1px solid #1a3d28}
.badge-off{background:#1f1212;color:#f87171;border:1px solid #3d1a1a}
.badge-warn{background:#2a2108;color:#fbbf24;border:1px solid #3d320a}
.badge-gray{background:#1a1a1a;color:#888;border:1px solid #333}
.phone{font-family:ui-monospace,monospace;color:#a3e635}
.sid{font-family:ui-monospace,monospace;font-size:11px;color:#666;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.actions{display:flex;gap:6px;flex-wrap:wrap}
.cmds{font-size:12px;color:#aaa}
.hidden{display:none!important}
.detail{font-size:11px;color:#555;margin-top:2px}
@media(max-width:700px){
  .stats{grid-template-columns:1fr 1fr}
  th:nth-child(3),td:nth-child(3){display:none}
}
</style>
</head>
<body>

<div id="login" class="login-wrap">
  <div class="login-card">
    <img class="logo" src="/logo" alt="Logo"/>
    <h1>${bot.name}</h1>
    <p>Panneau d'administration — accès restreint</p>
    <input type="password" id="secret-input" placeholder="ADMIN_SECRET" autocomplete="off"/>
    <button onclick="doLogin()">Entrer</button>
    <p class="err" id="login-err"></p>
  </div>
</div>

<div id="dashboard" class="hidden">
  <div class="header">
    <div>
      <h1><img class="header-logo" src="/logo" alt=""/>${bot.name} Admin</h1>
      <div class="meta" id="last-refresh">—</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-outline btn-sm" onclick="loadAll()">Rafraîchir</button>
      <button class="btn btn-gray btn-sm" onclick="doLogout()">Déconnexion</button>
    </div>
  </div>

  <div class="stats" id="stats-bar">
    <div class="stat"><div class="label">Sessions user</div><div class="value" id="s-users">—</div></div>
    <div class="stat"><div class="label">Connectées</div><div class="value" id="s-connected">—</div></div>
    <div class="stat"><div class="label">Actives</div><div class="value" id="s-active">—</div></div>
    <div class="stat"><div class="label">Commandes</div><div class="value" id="s-cmds">—</div></div>
  </div>

  <div class="toolbar">
    <input type="text" id="search" placeholder="Filtrer par téléphone, sessionId, nom..." oninput="renderTable()"/>
    <button class="btn btn-outline btn-sm" onclick="filterMode='all';renderTable()">Tous</button>
    <button class="btn btn-outline btn-sm" onclick="filterMode='connected';renderTable()">Connectés</button>
    <button class="btn btn-outline btn-sm" onclick="filterMode='active';renderTable()">Actifs</button>
    <button class="btn btn-outline btn-sm" onclick="filterMode='inactive';renderTable()">Inactifs</button>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Téléphone / Nom</th>
          <th>Session</th>
          <th>Statut</th>
          <th>Actif</th>
          <th>Stats</th>
          <th>Dernière activité</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
</div>

<script>
var SECRET = sessionStorage.getItem('prad_admin_secret') || '';
var sessions = [];
var filterMode = 'all';

function headers() {
  return { 'Content-Type': 'application/json', 'x-admin-secret': SECRET };
}

async function doLogin() {
  var key = document.getElementById('secret-input').value.trim();
  if (!key) return;
  SECRET = key;
  try {
    var res = await fetch('/admin/api/stats', { headers: headers() });
    if (!res.ok) {
      var d = await res.json().catch(function(){return {};});
      document.getElementById('login-err').textContent = d.error || 'Accès refusé';
      SECRET = '';
      return;
    }
    sessionStorage.setItem('prad_admin_secret', SECRET);
    document.getElementById('login').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    loadAll();
    setInterval(loadAll, 15000);
  } catch (e) {
    document.getElementById('login-err').textContent = 'Erreur réseau';
  }
}

function doLogout() {
  sessionStorage.removeItem('prad_admin_secret');
  SECRET = '';
  location.reload();
}

async function loadAll() {
  try {
    var [r1, r2] = await Promise.all([
      fetch('/admin/api/sessions', { headers: headers() }),
      fetch('/admin/api/stats', { headers: headers() })
    ]);
    if (!r1.ok || !r2.ok) {
      if (r1.status === 401 || r2.status === 401) { doLogout(); return; }
      return;
    }
    var data = await r1.json();
    var stats = await r2.json();
    sessions = data.sessions || [];
    document.getElementById('s-users').textContent = stats.userSessions;
    document.getElementById('s-connected').textContent = stats.usersConnected;
    document.getElementById('s-active').textContent = stats.usersActive;
    document.getElementById('s-cmds').textContent = stats.totalCommands;
    document.getElementById('last-refresh').textContent = 'MAJ ' + new Date().toLocaleTimeString('fr-FR');
    renderTable();
  } catch (e) {}
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('fr-FR'); } catch(e) { return '—'; }
}

function topCmds(byName) {
  if (!byName || typeof byName !== 'object') return '';
  var entries = Object.entries(byName).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3);
  if (!entries.length) return '';
  return entries.map(function(e){ return e[0]+'×'+e[1]; }).join(', ');
}

function renderTable() {
  var q = (document.getElementById('search').value || '').toLowerCase().trim();
  var list = sessions.filter(function(s) {
    if (filterMode === 'connected' && !s.connected) return false;
    if (filterMode === 'active' && !s.active) return false;
    if (filterMode === 'inactive' && s.active) return false;
    if (!q) return true;
    var hay = [s.sessionId, s.phone, s.pushName, s.type, s.status].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  });

  var tbody = document.getElementById('tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#555;padding:30px">Aucune session</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function(s) {
    var statusBadge = s.connected
      ? '<span class="badge badge-on">connecté</span>'
      : (s.status === 'qr' || s.status === 'pairing' || s.status === 'init'
          ? '<span class="badge badge-warn">'+(s.status||'?')+'</span>'
          : '<span class="badge badge-gray">'+(s.status||'offline')+'</span>');
    var activeBadge = s.active
      ? '<span class="badge badge-on">oui</span>'
      : '<span class="badge badge-off">non</span>';
    var phone = s.phone ? '<span class="phone">+'+s.phone+'</span>' : '<span style="color:#555">—</span>';
    var name = s.pushName ? '<div class="detail">'+esc(s.pushName)+'</div>' : '';
    var cmds = (s.stats && s.stats.commandCount) || 0;
    var lastCmd = (s.stats && s.stats.lastCommand) ? s.stats.lastCommand : '—';
    var top = topCmds(s.stats && s.stats.commandsByName);
    var isMain = s.type === 'main';
    var actions = '';
    if (!isMain) {
      if (s.active) {
        actions += '<button class="btn btn-yellow btn-sm" onclick="toggleActive(\\''+s.sessionId+'\\',false)">Désactiver</button>';
      } else {
        actions += '<button class="btn btn-green btn-sm" onclick="toggleActive(\\''+s.sessionId+'\\',true)">Activer</button>';
      }
      actions += '<button class="btn btn-red btn-sm" onclick="removeSession(\\''+s.sessionId+'\\')">Supprimer</button>';
    } else {
      actions = '<span style="color:#555;font-size:11px">protégée</span>';
    }
    return '<tr>' +
      '<td><span class="badge '+(isMain?'badge-on':'badge-gray')+'">'+s.type+'</span></td>' +
      '<td>'+phone+name+'</td>' +
      '<td><div class="sid" title="'+esc(s.sessionId)+'">'+esc(s.sessionId)+'</div></td>' +
      '<td>'+statusBadge+'</td>' +
      '<td>'+activeBadge+'</td>' +
      '<td class="cmds"><b>'+cmds+'</b> cmd'+(cmds>1?'s':'')+'<div class="detail">dernier: '+esc(lastCmd)+'</div>'+(top?'<div class="detail">'+esc(top)+'</div>':'')+'</td>' +
      '<td style="font-size:12px;color:#888">'+fmtDate(s.lastSeen)+'</td>' +
      '<td><div class="actions">'+actions+'</div></td>' +
      '</tr>';
  }).join('');
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function toggleActive(sessionId, active) {
  var msg = active ? 'Réactiver cette session ?' : 'Désactiver cette session ? (le socket sera fermé, les creds restent)';
  if (!confirm(msg)) return;
  try {
    var res = await fetch('/admin/api/session/active', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ sessionId: sessionId, active: active })
    });
    var data = await res.json();
    if (!res.ok) alert(data.error || 'Erreur');
    else loadAll();
  } catch (e) { alert('Erreur réseau'); }
}

async function removeSession(sessionId) {
  if (!confirm('SUPPRIMER définitivement cette session (creds inclus) ?')) return;
  try {
    var res = await fetch('/admin/api/session/remove', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ sessionId: sessionId })
    });
    var data = await res.json();
    if (!res.ok) alert(data.error || 'Erreur');
    else loadAll();
  } catch (e) { alert('Erreur réseau'); }
}

// Auto-login si secret déjà en session
if (SECRET) {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  loadAll();
  setInterval(loadAll, 15000);
}

document.getElementById('secret-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doLogin();
});
</script>
</body>
</html>`;
}

async function main() {
  console.log('[BOOT] starting...');
  await connectDB();
  console.log('[BOOT] MongoDB OK');
  if (!ADMIN_SECRET) {
    console.warn('[WARN] ADMIN_SECRET non défini — le panneau /admin sera inaccessible');
  }
  startWebServer();
  console.log('[BOOT] web server started');
  await manager.init();
  console.log('[BOOT] ' + bot.name + ' multi-sessions prêt');
  logger.info(bot.name + ' multi-sessions démarré');
}

main().catch(function (err) {
  console.error('[BOOT FATAL] ' + err.message);
  logger.error('Erreur fatale : ' + err.message);
  process.exit(1);
});
