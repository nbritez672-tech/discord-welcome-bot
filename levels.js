/**
 * levels.js — Sistema de niveles para Yin Yang | Script Hub
 *
 * Fuentes de XP:
 *  - Mensaje enviado          : XP_MESSAGE      (aleatorio en rango)
 *  - Tiempo activo en canal   : XP_PRESENCE     (por minuto, con cooldown de inactividad)
 *  - Reacción añadida         : XP_REACTION
 *  - Reporte en #bugs         : XP_BUG_REPORT
 *  - Sugerencia en #sugerencias: XP_SUGGESTION
 *
 * Curva de niveles:
 *  Los primeros 50 niveles son muy fáciles; a partir del 51 la curva se empina.
 *  XP requerida para pasar del nivel N al N+1:
 *    N <= 50  →  100 + N * 20           (nivel 1 = 120 XP, nivel 50 = 1100 XP)
 *    N >  50  →  1100 + (N-50)^2 * 25  (curva cuadrática pronunciada)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Configuración de XP ─────────────────────────────────────────────────────
const XP_MESSAGE_MIN  = 15;
const XP_MESSAGE_MAX  = 25;
const XP_REACTION     = 5;
const XP_BUG_REPORT   = 40;
const XP_SUGGESTION   = 30;
const XP_PRESENCE_PER_MINUTE = 3;   // XP cada minuto activo
const PRESENCE_INTERVAL_MS   = 60_000;
const PRESENCE_TIMEOUT_MS    = 5 * 60_000; // inactividad máxima: 5 min

// Cooldown para mensajes: evita farm de XP (1 XP por mensaje, máx 1 por cada 30s)
const MESSAGE_COOLDOWN_MS = 30_000;

// ── Persistencia ────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'levels.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Curva de niveles ────────────────────────────────────────────────────────
/**
 * XP necesaria para subir DEL nivel `n` AL nivel `n+1`.
 */
function xpForLevel(n) {
  if (n <= 50) return 100 + n * 20;
  return 1100 + Math.pow(n - 50, 2) * 25;
}

/**
 * XP TOTAL acumulada para haber alcanzado el nivel `lvl` (desde 0).
 */
function totalXpForLevel(lvl) {
  let total = 0;
  for (let i = 0; i < lvl; i++) total += xpForLevel(i);
  return total;
}

/**
 * Dado un XP total, devuelve { level, currentXp, neededXp }.
 */
function calculateLevel(totalXp) {
  let lvl = 0;
  let remaining = totalXp;
  while (true) {
    const need = xpForLevel(lvl);
    if (remaining < need) {
      return { level: lvl, currentXp: Math.floor(remaining), neededXp: need };
    }
    remaining -= need;
    lvl++;
  }
}

// ── Estado interno ──────────────────────────────────────────────────────────
// cooldowns de mensajes: userId -> timestamp último mensaje
const messageCooldowns = new Map();

// presencia activa: userId -> { lastActivity: ts, intervalId }
const presenceTimers  = new Map();

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Agrega XP a un usuario. Devuelve { leveledUp, oldLevel, newLevel, userData }
 * si hubo level-up; de lo contrario { leveledUp: false, userData }.
 */
function addXp(guildId, userId, amount, username, joinedTimestamp) {
  const data = loadData();
  if (!data[guildId]) data[guildId] = {};

  if (!data[guildId][userId]) {
    data[guildId][userId] = {
      xp: 0,
      messages: 0,
      joinedTimestamp: joinedTimestamp || Date.now(),
      username,
    };
  }

  const user = data[guildId][userId];
  // Actualizar username siempre que se sepa
  if (username) user.username = username;

  const oldInfo = calculateLevel(user.xp);
  user.xp += amount;
  const newInfo = calculateLevel(user.xp);

  saveData(data);

  const leveledUp = newInfo.level > oldInfo.level;
  return {
    leveledUp,
    oldLevel : oldInfo.level,
    newLevel : newInfo.level,
    userData : { ...user, ...newInfo },
  };
}

/**
 * Registra un mensaje (con cooldown).
 */
function registerMessage(guildId, userId, username, joinedTimestamp) {
  const now     = Date.now();
  const lastMsg = messageCooldowns.get(userId) || 0;
  if (now - lastMsg < MESSAGE_COOLDOWN_MS) return null;
  messageCooldowns.set(userId, now);

  const xp = Math.floor(
    Math.random() * (XP_MESSAGE_MAX - XP_MESSAGE_MIN + 1) + XP_MESSAGE_MIN
  );

  // Incrementar contador de mensajes
  const data = loadData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) {
    data[guildId][userId] = { xp: 0, messages: 0, joinedTimestamp: joinedTimestamp || now, username };
  }
  data[guildId][userId].messages = (data[guildId][userId].messages || 0) + 1;
  saveData(data);

  return addXp(guildId, userId, xp, username, joinedTimestamp);
}

/**
 * Registra una reacción.
 */
function registerReaction(guildId, userId, username) {
  return addXp(guildId, userId, XP_REACTION, username);
}

/**
 * Registra un reporte de bug.
 */
function registerBugReport(guildId, userId, username, joinedTimestamp) {
  return addXp(guildId, userId, XP_BUG_REPORT, username, joinedTimestamp);
}

/**
 * Registra una sugerencia.
 */
function registerSuggestion(guildId, userId, username, joinedTimestamp) {
  return addXp(guildId, userId, XP_SUGGESTION, username, joinedTimestamp);
}

/**
 * Inicia el seguimiento de presencia para un usuario (llamar cuando escribe
 * o cuando entra al servidor). Actualiza el timer de actividad.
 */
function touchPresence(guildId, userId, username, joinedTimestamp) {
  const now = Date.now();

  if (presenceTimers.has(userId)) {
    const entry = presenceTimers.get(userId);
    entry.lastActivity = now;
    return;
  }

  // Primer contacto: arrancar intervalo de 1 min
  const entry = { lastActivity: now, intervalId: null };
  entry.intervalId = setInterval(async () => {
    const sinceActivity = Date.now() - entry.lastActivity;
    if (sinceActivity > PRESENCE_TIMEOUT_MS) {
      // Usuario inactivo → detener timer
      clearInterval(entry.intervalId);
      presenceTimers.delete(userId);
      return;
    }
    // Usuario activo → dar XP de presencia
    addXp(guildId, userId, XP_PRESENCE_PER_MINUTE, username, joinedTimestamp);
  }, PRESENCE_INTERVAL_MS);

  presenceTimers.set(userId, entry);
}

/**
 * Devuelve los datos actuales de un usuario.
 */
function getUserData(guildId, userId) {
  const data = loadData();
  const user = data?.[guildId]?.[userId];
  if (!user) return null;
  const info = calculateLevel(user.xp);
  return { ...user, ...info };
}

/**
 * Devuelve el top N de usuarios de un servidor.
 */
function getLeaderboard(guildId, limit = 10) {
  const data  = loadData();
  const guild = data[guildId] || {};
  return Object.entries(guild)
    .map(([userId, u]) => ({ userId, ...u, ...calculateLevel(u.xp) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

module.exports = {
  addXp,
  registerMessage,
  registerReaction,
  registerBugReport,
  registerSuggestion,
  touchPresence,
  getUserData,
  getLeaderboard,
  calculateLevel,
  xpForLevel,
};
