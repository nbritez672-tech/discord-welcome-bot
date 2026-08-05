/**
 * levels.js — Sistema de niveles para Yin Yang | Script Hub
 * Persistencia: MongoDB Atlas (datos nunca se pierden en Railway)
 */

'use strict';

const { MongoClient } = require('mongodb');

// ── Configuración de XP ─────────────────────────────────────────────────────
const XP_MESSAGE_MIN         = 15;
const XP_MESSAGE_MAX         = 25;
const XP_REACTION            = 5;
const XP_BUG_REPORT          = 40;
const XP_SUGGESTION          = 30;
const XP_PRESENCE_PER_MINUTE = 3;
const PRESENCE_INTERVAL_MS   = 60_000;
const PRESENCE_TIMEOUT_MS    = 5 * 60_000;
const MESSAGE_COOLDOWN_MS    = 30_000;

// ── Conexión MongoDB ─────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI;
let db = null;

async function connectDB() {
  if (db) return db;
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('yinyang');
  console.log('✅ Conectado a MongoDB Atlas');
  return db;
}

function col() {
  return db.collection('levels');
}

// ── Curva de niveles ─────────────────────────────────────────────────────────
function xpForLevel(n) {
  if (n <= 50) return 100 + n * 20;
  return 1100 + Math.pow(n - 50, 2) * 25;
}

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

// ── Estado en memoria (cooldowns y presencia) ────────────────────────────────
const messageCooldowns = new Map();
const presenceTimers   = new Map();

// ── API pública ──────────────────────────────────────────────────────────────

async function addXp(guildId, userId, amount, username, joinedTimestamp) {
  await connectDB();

  const filter = { guildId, userId };
  const user   = await col().findOne(filter) || {
    guildId,
    userId,
    xp            : 0,
    messages      : 0,
    joinedTimestamp: joinedTimestamp || Date.now(),
    username      : username || 'Desconocido',
  };

  if (username) user.username = username;

  const oldInfo = calculateLevel(user.xp);
  user.xp += amount;
  const newInfo = calculateLevel(user.xp);

  await col().updateOne(filter, { $set: user }, { upsert: true });

  return {
    leveledUp: newInfo.level > oldInfo.level,
    oldLevel : oldInfo.level,
    newLevel : newInfo.level,
    userData : { ...user, ...newInfo },
  };
}

async function registerMessage(guildId, userId, username, joinedTimestamp) {
  const now     = Date.now();
  const lastMsg = messageCooldowns.get(userId) || 0;
  if (now - lastMsg < MESSAGE_COOLDOWN_MS) return null;
  messageCooldowns.set(userId, now);

  const xp = Math.floor(
    Math.random() * (XP_MESSAGE_MAX - XP_MESSAGE_MIN + 1) + XP_MESSAGE_MIN
  );

  // addXp maneja la creación del documento si no existe
  // e incrementa el contador de mensajes internamente
  const result = await addXp(guildId, userId, xp, username, joinedTimestamp);

  // Incrementar contador de mensajes por separado (sin tocar xp)
  await connectDB();
  await col().updateOne(
    { guildId, userId },
    { $inc: { messages: 1 } }
  );

  return result;
}

async function registerReaction(guildId, userId, username) {
  return addXp(guildId, userId, XP_REACTION, username);
}

async function registerBugReport(guildId, userId, username, joinedTimestamp) {
  return addXp(guildId, userId, XP_BUG_REPORT, username, joinedTimestamp);
}

async function registerSuggestion(guildId, userId, username, joinedTimestamp) {
  return addXp(guildId, userId, XP_SUGGESTION, username, joinedTimestamp);
}

function touchPresence(guildId, userId, username, joinedTimestamp) {
  const now = Date.now();

  if (presenceTimers.has(userId)) {
    presenceTimers.get(userId).lastActivity = now;
    return;
  }

  const entry = { lastActivity: now, intervalId: null };
  entry.intervalId = setInterval(async () => {
    if (Date.now() - entry.lastActivity > PRESENCE_TIMEOUT_MS) {
      clearInterval(entry.intervalId);
      presenceTimers.delete(userId);
      return;
    }
    await addXp(guildId, userId, XP_PRESENCE_PER_MINUTE, username, joinedTimestamp);
  }, PRESENCE_INTERVAL_MS);

  presenceTimers.set(userId, entry);
}

async function getUserData(guildId, userId) {
  await connectDB();
  const user = await col().findOne({ guildId, userId });
  if (!user) return null;
  return { ...user, ...calculateLevel(user.xp) };
}

async function getLeaderboard(guildId, limit = 10) {
  await connectDB();
  const users = await col()
    .find({ guildId })
    .sort({ xp: -1 })
    .limit(limit)
    .toArray();
  return users.map(u => ({ ...u, ...calculateLevel(u.xp) }));
}

module.exports = {
  connectDB,
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
