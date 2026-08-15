'use strict';

/**
 * Gère plusieurs connexions WhatsApp en parallèle :
 * - 1 session principale (bot)
 * - N sessions utilisateurs (WhatsApp perso + commandes bot)
 */

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');

const {
  useMongoAuthState,
  deleteSession,
  updateSessionMeta,
  listSessions,
} = require('../utils/sessionStore');
const { handleMessage }         = require('../handlers/messageHandler');
const { registerEventHandlers } = require('../handlers/eventHandler');
const logger                    = require('../utils/logger');
const qrcode                    = require('qrcode');
const { registerViewOnceReact } = require('../handlers/viewOnceReact');

const MAIN_SESSION_ID = process.env.SESSION_ID || 'prad-bot-main';

/** Logger minimal compatible Baileys (évite les crashs .child) */
function baileysLogger() {
  const noop = function () {};
  const l = {
    level: 'silent',
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: function () { return l; },
  };
  return l;
}

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.version = null;
    this._restartTimers = new Map();
    this._starting = new Set(); // évite double démarrage
  }

  async init() {
    console.log('[SessionManager] init...');
    const { version } = await fetchLatestBaileysVersion();
    this.version = version;
    console.log('[SessionManager] Baileys ' + version.join('.'));
    logger.info('Baileys ' + version.join('.'));

    console.log('[SessionManager] start main session: ' + MAIN_SESSION_ID);
    await this.startSession(MAIN_SESSION_ID, 'main');

    const users = await listSessions({ type: 'user', registered: true, active: true });
    for (const u of users) {
      if (u.sessionId === MAIN_SESSION_ID) continue;
      logger.info('Restauration session user: ' + u.sessionId + ' (' + (u.phone || '?') + ')');
      await this.startSession(u.sessionId, 'user');
    }
  }
  
  // Nettoyage sessions user inactives (défaut 30 jours)
  this._startInactivityCleanup();
  
  /**
   * Met à jour lastSeen (appelé à chaque commande user).
   */
  async touchSession(sessionId) {
    try {
      await updateSessionMeta(sessionId, { lastSeen: Date.now() });
    } catch (_) {}
  }

  /**
   * Supprime les sessions user inactives depuis INACTIVITY_DAYS (défaut 30).
   */
  _startInactivityCleanup() {
    const days = parseInt(process.env.SESSION_INACTIVITY_DAYS || '30', 10);
    const ms = days * 24 * 60 * 60 * 1000;
    const self = this;

    async function run() {
      try {
        const users = await listSessions({ type: 'user' });
        const now = Date.now();
        for (const u of users) {
          if (u.sessionId === MAIN_SESSION_ID) continue;
          const last = u.lastSeen ? new Date(u.lastSeen).getTime() : (u.updatedAt ? new Date(u.updatedAt).getTime() : 0);
          if (last && (now - last) > ms) {
            console.log('[CLEANUP] Session inactive ' + u.sessionId + ' (>' + days + 'j) — suppression');
            try { await self.removeSession(u.sessionId); } catch (_) {}
          }
        }
      } catch (e) {
        console.error('[CLEANUP] error: ' + e.message);
      }
    }

    // Toutes les 6 heures
    setInterval(run, 6 * 60 * 60 * 1000);
    // Premier passage après 2 min
    setTimeout(run, 120000);
  }

  getMainSessionId() {
    return MAIN_SESSION_ID;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  getAll() {
    const result = [];
    for (const [id, s] of this.sessions) {
      result.push({
        sessionId: id,
        type: s.type,
        status: s.status,
        connected: s.status === 'connected',
        qr: s.qr,
        pairingCode: s.pairingCode,
        phone: s.phone || null,
        lastError: s.lastError || null,
      });
    }
    return result;
  }

  async startSession(sessionId, type, forceNew) {
    if (type === undefined) type = 'user';
    if (forceNew === undefined) forceNew = false;

    if (this._starting.has(sessionId)) {
      console.log('[SKIP] startSession déjà en cours: ' + sessionId);
      return;
    }
    this._starting.add(sessionId);
    clearTimeout(this._restartTimers.get(sessionId));

    if (forceNew) {
      await deleteSession(sessionId);
    }

    const existing = this.sessions.get(sessionId);
    if (existing && existing.sock) {
      try {
        existing.sock.ev.removeAllListeners();
        existing.sock.end(undefined);
      } catch (_) {}
    }

    const entry = {
      sock: null,
      status: 'init',
      qr: null,
      pairingCode: null,
      type: type,
      phone: null,
      lastError: null,
    };
    this.sessions.set(sessionId, entry);

    try {
      const auth = await useMongoAuthState(sessionId);
      const authState = auth.state;
      const saveCreds = auth.saveCreds;

      const sock = makeWASocket({
        version: this.version,
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, baileysLogger()),
        },
        logger: baileysLogger(),
        browser: ['Ubuntu', 'Chrome', '22.04.4'],
        markOnlineOnConnect: type === 'main',
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        qrTimeout: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 400,
      });

      entry.sock = sock;
      sock.sessionId = sessionId;
      sock.sessionType = type;

      sock.ev.on('creds.update', saveCreds);

      const self = this;
      sock.ev.on('connection.update', async function (update) {
        const connection = update.connection;
        const lastDisconnect = update.lastDisconnect;
        const qr = update.qr;

        if (qr) {
          try {
            entry.qr = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
            entry.status = 'qr';
            entry.pairingCode = null;
            logger.info('[' + sessionId + '] QR généré');
            console.log('[QR] ' + sessionId);
          } catch (e) {
            logger.error('[' + sessionId + '] QR error: ' + e.message);
          }
        }

        if (connection === 'open') {
          entry.status = 'connected';
          entry.qr = null;
          entry.pairingCode = null;

          var phone = null;
          if (sock.user && sock.user.id) {
            phone = sock.user.id.split(':')[0].split('@')[0];
          }
          entry.phone = phone;

          await updateSessionMeta(sessionId, {
            registered: true,
            phone: phone,
            pushName: (sock.user && (sock.user.name || sock.user.verifiedName)) || null,
            type: type,
            active: true,
          });

          logger.info('[' + sessionId + '] CONNECTÉ' + (phone ? ' (' + phone + ')' : ''));
          console.log('✅ Session ' + sessionId + ' CONNECTÉE' + (phone ? ' — ' + phone : ''));
        }

        if (connection === 'close') {
          entry.status = 'close';
          entry.qr = null;

          var statusCode = null;
          var reason = 'Unknown';
          if (lastDisconnect && lastDisconnect.error) {
            if (lastDisconnect.error.output) statusCode = lastDisconnect.error.output.statusCode;
            reason = lastDisconnect.error.message || 'Unknown';
          }
          logger.warn('[' + sessionId + '] Fermé — ' + statusCode + ' | ' + reason);

          // 440 conflict = une autre connexion utilise la même session
          // → NE PAS spammer les reconnexions (sinon boucle infinie)
          if (statusCode === 440 || (reason && reason.indexOf('conflict') !== -1)) {
            console.warn('[CONFLICT][' + sessionId + '] attente 30s avant reconnexion...');
            entry.status = 'conflict';
            entry.lastError = 'Conflict 440 — autre connexion active. Retry dans 30s.';
            self._scheduleRestart(sessionId, type, false, 30000);
            return;
          }

          if (
            statusCode === DisconnectReason.restartRequired ||
            statusCode === 515 ||
            (reason && reason.indexOf('restart required') !== -1)
          ) {
            self._scheduleRestart(sessionId, type, false, 2000);
            return;
          }

          if (
            statusCode === DisconnectReason.loggedOut ||
            statusCode === 401 ||
            statusCode === 403
          ) {
            await deleteSession(sessionId);
            entry.status = 'logged_out';
            entry.lastError = 'Session déconnectée (logged out)';
            if (type === 'main') {
              self._scheduleRestart(sessionId, type, true, 3000);
            } else {
              self.sessions.delete(sessionId);
            }
            return;
          }

          // Stream Errored générique : backoff progressif
          if (reason && reason.indexOf('Stream Errored') !== -1) {
            self._scheduleRestart(sessionId, type, false, 15000);
            return;
          }

          self._scheduleRestart(sessionId, type, false, 8000);
        }
      });

      if (type === 'main') {
        registerEventHandlers(sock);
      }

      // Extraction discrète vue unique par réaction emoji (toutes sessions)
      registerViewOnceReact(sock);

      sock.ev.on('messages.upsert', function (payload) {
        if (payload.type !== 'notify') return;
        payload.messages.forEach(function (msg) {
          handleMessage(sock, msg).catch(function (err) {
            logger.error('[' + sessionId + '] msg error: ' + err.message);
          });
        });
      });

      this._starting.delete(sessionId);

    } catch (err) {
      this._starting.delete(sessionId);

      const msg = (err && err.message) ? err.message : String(err);
      const stack = (err && err.stack) ? err.stack : '';
      console.error('[FATAL][' + sessionId + '] ' + msg);
      console.error(stack);
      logger.error('[' + sessionId + '] startSession fatal: ' + msg);
      entry.status = 'error';
      entry.lastError = msg;
      this._scheduleRestart(sessionId, type, false, 8000);
    }
  }

  _scheduleRestart(sessionId, type, forceNew, delay) {
    clearTimeout(this._restartTimers.get(sessionId));
    var self = this;
    var t = setTimeout(function () {
      self.startSession(sessionId, type, forceNew);
    }, delay);
    this._restartTimers.set(sessionId, t);
  }

  /**
   * Reprend une session user existante (après refresh navigateur / redémarrage).
   * Si absente en mémoire mais présente en Mongo (registered), la relance.
   */
  async resumeSession(sessionId) {
    if (!sessionId) throw new Error('sessionId requis');
    if (sessionId === MAIN_SESSION_ID) throw new Error('Session principale interdite ici');

    const existing = this.sessions.get(sessionId);
    if (existing && existing.sock && existing.status === 'connected') {
      return { sessionId: sessionId, status: existing.status, phone: existing.phone };
    }
    if (existing && existing.sock && (existing.status === 'qr' || existing.status === 'pairing' || existing.status === 'init')) {
      return { sessionId: sessionId, status: existing.status, phone: existing.phone };
    }

    // Relancer depuis Mongo (sans forceNew → garde les creds)
    await this.startSession(sessionId, 'user', false);
    const s = this.sessions.get(sessionId);
    return {
      sessionId: sessionId,
      status: s ? s.status : 'init',
      phone: s ? s.phone : null,
    };
  }

  async createUserSession() {
    var sessionId = 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await this.startSession(sessionId, 'user', true);
    return sessionId;
  }

  async requestPairingCode(sessionId, phone) {
    var entry = this.sessions.get(sessionId);
    if (!entry || !entry.sock) throw new Error('Session pas prête');
    if (entry.sock.authState && entry.sock.authState.creds && entry.sock.authState.creds.registered) {
      throw new Error('Déjà connecté');
    }
    var code = await entry.sock.requestPairingCode(String(phone).replace(/\D/g, ''));
    entry.pairingCode = code;
    entry.status = 'pairing';
    return code;
  }

  async removeSession(sessionId) {
    if (sessionId === MAIN_SESSION_ID) {
      throw new Error('Impossible de supprimer la session principale');
    }
    var entry = this.sessions.get(sessionId);
    if (entry && entry.sock) {
      try {
        entry.sock.ev.removeAllListeners();
        entry.sock.end(undefined);
      } catch (_) {}
    }
    this.sessions.delete(sessionId);
    clearTimeout(this._restartTimers.get(sessionId));
    await deleteSession(sessionId);
  }

  async resetMainSession() {
    await this.startSession(MAIN_SESSION_ID, 'main', true);
  }
}

module.exports = { SessionManager, MAIN_SESSION_ID };
