require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const {
  createCanvas,
  loadImage,
  GlobalFonts
} = require('@napi-rs/canvas');

const os   = require('os');
const fs   = require('fs');
const path = require('path');

// ── Sistema de niveles ───────────────────────────────────────────────────────
const levels      = require('./levels');
const { createLevelUpCard } = require('./levelCard');

// ── Fuentes ──────────────────────────────────────────────────────────────────
async function loadFonts() {
  const fontUrl  = 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2';
  const fontPath = path.join(os.tmpdir(), 'Inter-Bold.woff2');
  if (!fs.existsSync(fontPath)) {
    const res = await fetch(fontUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(fontPath, buf);
  }
  GlobalFonts.registerFromPath(fontPath, 'Inter');
  console.log('✅ Fuente Inter registrada');
}

// ── Variables de entorno ─────────────────────────────────────────────────────
const TOKEN              = process.env.TOKEN;
const CLIENT_ID          = process.env.CLIENT_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const LEVELUP_CHANNEL_ID = process.env.LEVELUP_CHANNEL_ID; // Canal #level-up
const BUGS_CHANNEL_ID    = process.env.BUGS_CHANNEL_ID;    // Canal #bugs
const SUGGEST_CHANNEL_ID = process.env.SUGGEST_CHANNEL_ID; // Canal #sugerencias

if (!TOKEN)              { console.error('Falta TOKEN.');              process.exit(1); }
if (!CLIENT_ID)          { console.error('Falta CLIENT_ID.');          process.exit(1); }
if (!WELCOME_CHANNEL_ID) { console.error('Falta WELCOME_CHANNEL_ID.'); process.exit(1); }
if (!LEVELUP_CHANNEL_ID) { console.error('Falta LEVELUP_CHANNEL_ID.'); process.exit(1); }

// ── Cliente Discord ──────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ]
});

// ── Helper: enviar level-up card al canal ───────────────────────────────────
async function sendLevelUp(guild, member, userData) {
  try {
    const channel = LEVELUP_CHANNEL_ID
      ? await guild.channels.fetch(LEVELUP_CHANNEL_ID).catch(() => null)
      : null;
    if (!channel?.isTextBased()) return;

    const image = await createLevelUpCard({
      username       : member.user.username,
      avatarUrl      : member.user.displayAvatarURL({ extension: 'png', size: 512 }),
      guildName      : guild.name,
      memberCount    : userData.memberNumber || guild.memberCount,
      level          : userData.level,
      currentXp      : userData.currentXp,
      neededXp       : userData.neededXp,
      totalMessages  : userData.messages || 0,
      joinedTimestamp: userData.joinedTimestamp,
    });

    await channel.send({
      content: `You leveled up ${member}`,
      files  : [new AttachmentBuilder(image, { name: 'levelup.png' })],
    });
  } catch (err) {
    console.error('Error enviando level-up card:', err);
  }
}

// ── Helper: procesar resultado de XP y disparar level-up si aplica ──────────
async function handleXpResult(result, guild, member) {
  if (!result) return;
  if (result.leveledUp) {
    await sendLevelUp(guild, member, result.userData);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FUNCIONES ORIGINALES (bienvenida, moderación, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

function getMemberTag(member) {
  const roles = [...member.roles.cache.values()]
    .filter(role => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);
  return roles.length ? roles[0].name : 'Miembro';
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function createWelcomeImage(member) {
  const W = 860;
  const H = 280;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0,   '#1a1c2e');
  bgGrad.addColorStop(0.5, '#1e2235');
  bgGrad.addColorStop(1,   '#16182a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const borderGrad = ctx.createLinearGradient(0, 0, W, 0);
  borderGrad.addColorStop(0,   '#ff6ec7');
  borderGrad.addColorStop(0.5, '#a78bfa');
  borderGrad.addColorStop(1,   '#60a5fa');
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, 0, W, 3);
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, H - 3, W, 3);

  const avatarSize = 140;
  const avatarX    = 80 + avatarSize / 2;
  const avatarY    = H / 2;

  const ringGrad = ctx.createLinearGradient(
    avatarX - avatarSize / 2, avatarY - avatarSize / 2,
    avatarX + avatarSize / 2, avatarY + avatarSize / 2
  );
  ringGrad.addColorStop(0, '#ff6ec7');
  ringGrad.addColorStop(1, '#60a5fa');
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = ringGrad;
  ctx.stroke();

  const avatarResponse = await fetch(member.user.displayAvatarURL({ extension: 'png', size: 512 }));
  const avatarBuffer   = Buffer.from(await avatarResponse.arrayBuffer());
  const avatar         = await loadImage(avatarBuffer);

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
  ctx.restore();

  const divX    = 80 + avatarSize + 40;
  const divGrad = ctx.createLinearGradient(0, 40, 0, H - 40);
  divGrad.addColorStop(0,   'rgba(167,139,250,0)');
  divGrad.addColorStop(0.3, 'rgba(167,139,250,0.8)');
  divGrad.addColorStop(0.7, 'rgba(167,139,250,0.8)');
  divGrad.addColorStop(1,   'rgba(167,139,250,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(divX, 40, 2, H - 80);

  const textX = divX + 36;
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur   = 10;

  ctx.textAlign = 'left';
  ctx.font      = 'bold 13px "Inter"';
  const tagGrad = ctx.createLinearGradient(textX, 0, textX + 340, 0);
  tagGrad.addColorStop(0, '#ff6ec7');
  tagGrad.addColorStop(1, '#60a5fa');
  ctx.fillStyle = tagGrad;
  ctx.fillText('✦  ¡BIENVENIDO/A AL SERVIDOR!  ✦', textX, 88);

  ctx.font      = 'bold 52px "Inter"';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(member.user.username, textX, 148);

  ctx.font      = '22px "Inter"';
  ctx.fillStyle = '#8b9dc3';
  ctx.fillText(`en ${member.guild.name}`, textX, 196);

  const badgeX = textX;
  const badgeY = 228;
  const badgeW = 180;
  const badgeH = 30;
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, badgeX, badgeY - badgeH / 2, badgeW, badgeH, 6);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth   = 1;
  roundRect(ctx, badgeX, badgeY - badgeH / 2, badgeW, badgeH, 6);
  ctx.stroke();

  ctx.font      = 'bold 13px "Inter"';
  ctx.fillStyle = '#c0cde8';
  ctx.textAlign = 'left';
  ctx.fillText(`MIEMBRO  #${member.guild.memberCount}`, badgeX + 10, badgeY);

  return canvas.toBuffer('image/png');
}

// ── Moderación ───────────────────────────────────────────────────────────────
const ALLOWED_LINKS_FILE = path.join(__dirname, 'allowed-links.json');
const WARNINGS_FILE      = path.join(__dirname, 'warnings.json');

const URL_REGEX           = /(https?:\/\/[^\s]+)|(discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[^\s]+)/gi;
const DISCORD_INVITE_REGEX = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\//i;

function loadAllowedLinks() {
  if (!fs.existsSync(ALLOWED_LINKS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ALLOWED_LINKS_FILE, 'utf8')); } catch { return []; }
}
function saveAllowedLinks(list) {
  fs.writeFileSync(ALLOWED_LINKS_FILE, JSON.stringify(list, null, 2), 'utf8');
}
function loadWarnings() {
  if (!fs.existsSync(WARNINGS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8')); } catch { return {}; }
}
function saveWarnings(data) {
  fs.writeFileSync(WARNINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function extractDomain(url) {
  try {
    const normalized = url.match(/^https?:\/\//i) ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./i, '').toLowerCase();
  } catch { return null; }
}
function extractInviteCode(url) {
  const match = url.match(/discord(?:\.gg|app\.com\/invite|\.com\/invite)\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}
function findDisallowedLink(content, allowedDomains) {
  const matches = content.match(URL_REGEX);
  if (!matches) return null;
  const allowedInviteCodes = allowedDomains.map(d => extractInviteCode(d)).filter(Boolean);
  for (const raw of matches) {
    if (DISCORD_INVITE_REGEX.test(raw)) {
      const code = extractInviteCode(raw);
      if (code && allowedInviteCodes.includes(code)) continue;
      return raw;
    }
    const domain = extractDomain(raw);
    if (!domain) return raw;
    const isAllowed = allowedDomains.some(d =>
      domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`)
    );
    if (!isAllowed) return raw;
  }
  return null;
}

async function createWarningImage(member, reasonText) {
  const W = 860; const H = 220;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#2e1a1a'); bgGrad.addColorStop(0.5, '#351e1e'); bgGrad.addColorStop(1, '#2a1616');
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

  const borderGrad = ctx.createLinearGradient(0, 0, W, 0);
  borderGrad.addColorStop(0, '#ff4d4d'); borderGrad.addColorStop(1, '#ff8a5c');
  ctx.fillStyle = borderGrad; ctx.fillRect(0, 0, W, 3); ctx.fillRect(0, H - 3, W, 3);

  const avatarSize = 110; const avatarX = 80 + avatarSize / 2; const avatarY = H / 2;

  ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.lineWidth = 4; ctx.strokeStyle = '#ff4d4d'; ctx.stroke();

  const avatarResponse = await fetch(member.user.displayAvatarURL({ extension: 'png', size: 512 }));
  const avatarBuffer   = Buffer.from(await avatarResponse.arrayBuffer());
  const avatar         = await loadImage(avatarBuffer);

  ctx.save();
  ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(avatar, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
  ctx.restore();

  const textX = 80 + avatarSize + 40;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = 'bold 30px "Inter"'; ctx.fillStyle = '#FFFFFF';
  ctx.fillText(member.user.username, textX, 78);
  ctx.font = 'bold 17px "Inter"'; ctx.fillStyle = '#ff4d4d';
  wrapText(ctx, reasonText, textX, 118, W - textX - 40, 24);

  return canvas.toBuffer('image/png');
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = ''; let curY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, curY); line = word; curY += lineHeight;
    } else { line = testLine; }
  }
  if (line) ctx.fillText(line, x, curY);
}

async function applyModerationStrike(message, reasonText, extraMessagesToDelete = []) {
  const warnings = loadWarnings();
  const guildId  = message.guild.id;
  const userId   = message.author.id;
  if (!warnings[guildId]) warnings[guildId] = {};
  const current = (warnings[guildId][userId] || 0) + 1;
  warnings[guildId][userId] = current;
  saveWarnings(warnings);

  const toDelete = [message, ...extraMessagesToDelete];
  const seenIds  = new Set();
  for (const m of toDelete) {
    if (seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    await m.delete().catch(() => {});
  }

  try {
    const image = await createWarningImage(message.member, reasonText);
    await message.channel.send({ files: [new AttachmentBuilder(image, { name: 'warning.png' })] });
  } catch (err) { console.error('Error generando imagen de advertencia:', err); }

  if (current >= 2) {
    if (message.member.kickable) {
      await message.member.kick('2da infracción: links/spam no permitido').catch(err => {
        console.error('Error expulsando miembro:', err);
      });
      warnings[guildId][userId] = 0;
      saveWarnings(warnings);
    } else {
      console.error(`No se pudo expulsar a ${message.author.tag}: sin permisos suficientes.`);
    }
  }
}

// ── Anti-spam ────────────────────────────────────────────────────────────────
const recentMessages    = new Map();
const SPAM_WINDOW_MS    = 10000;
const SPAM_REPEAT_COUNT = 3;

function registerMessageForSpamCheck(message) {
  const userId  = message.author.id;
  const now     = Date.now();
  const history = recentMessages.get(userId) || [];
  const updated = history.filter(m => now - m.ts < SPAM_WINDOW_MS);
  updated.push({ message, ts: now });
  recentMessages.set(userId, updated);
  const sameCount = updated.filter(m => m.message.content === message.content).length;
  if (sameCount >= SPAM_REPEAT_COUNT) {
    recentMessages.delete(userId);
    return updated.map(m => m.message);
  }
  return null;
}

// ── Recordatorios ────────────────────────────────────────────────────────────
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');
const activeTimers   = new Map();

function loadReminders() {
  if (!fs.existsSync(REMINDERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')); } catch { return []; }
}
function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf8');
}
function startReminder(reminder) {
  if (activeTimers.has(reminder.id)) return;
  const timer = setInterval(async () => {
    try {
      const channel = await client.channels.fetch(reminder.channelId);
      if (channel?.isTextBased()) await channel.send(reminder.message);
    } catch (err) { console.error(`Error enviando recordatorio ${reminder.id}:`, err); }
  }, reminder.intervalMs);
  activeTimers.set(reminder.id, timer);
  console.log(`✅ Recordatorio "${reminder.id}" activo cada ${reminder.intervalMs / 60000} min`);
}
function parseInterval(str) {
  const match = str.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val  = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  return val * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMANDOS SLASH
// ═══════════════════════════════════════════════════════════════════════════════

const reminderCommand = new SlashCommandBuilder()
  .setName('recordatorio')
  .setDescription('Crea un recordatorio periódico')
  .addStringOption(opt => opt.setName('intervalo').setDescription('Cada cuánto enviar (ej: 30m, 2h, 1d)').setRequired(true))
  .addChannelOption(opt => opt.setName('canal').setDescription('Canal donde se enviará el mensaje').setRequired(true))
  .addStringOption(opt => opt.setName('mensaje').setDescription('Mensaje del recordatorio').setRequired(true))
  .addStringOption(opt => opt.setName('id').setDescription('Nombre único para este recordatorio').setRequired(true));

const deleteCommand = new SlashCommandBuilder()
  .setName('borrar-recordatorio')
  .setDescription('Elimina un recordatorio activo')
  .addStringOption(opt => opt.setName('id').setDescription('ID del recordatorio a borrar').setRequired(true));

const listLinksCommand = new SlashCommandBuilder()
  .setName('links-permitidos')
  .setDescription('Muestra la lista de dominios permitidos en el servidor')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const editLinksCommand = new SlashCommandBuilder()
  .setName('editar-links')
  .setDescription('Agrega o quita un dominio de la lista de links permitidos')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt.setName('accion').setDescription('Qué hacer con el dominio').setRequired(true)
      .addChoices({ name: 'Agregar', value: 'agregar' }, { name: 'Quitar', value: 'quitar' })
  )
  .addStringOption(opt => opt.setName('dominio').setDescription('Dominio a agregar o quitar (ej: youtube.com)').setRequired(true));

// ── /nivel — ver nivel propio ────────────────────────────────────────────────
const nivelCommand = new SlashCommandBuilder()
  .setName('nivel')
  .setDescription('Muestra tu nivel actual, XP y estadísticas')
  .addUserOption(opt =>
    opt.setName('usuario')
      .setDescription('Ver el nivel de otro miembro (opcional)')
      .setRequired(false)
  );

// ── /ranking — top 10 del servidor ──────────────────────────────────────────
const rankingCommand = new SlashCommandBuilder()
  .setName('ranking')
  .setDescription('Muestra el top 10 de miembros más activos del servidor');

// ═══════════════════════════════════════════════════════════════════════════════
//  EVENTOS
// ═══════════════════════════════════════════════════════════════════════════════

client.once('ready', async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: [
        reminderCommand.toJSON(),
        deleteCommand.toJSON(),
        listLinksCommand.toJSON(),
        editLinksCommand.toJSON(),
        nivelCommand.toJSON(),
        rankingCommand.toJSON(),
      ]
    });
    console.log('✅ Comandos slash registrados');
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }

  const reminders = loadReminders();
  for (const r of reminders) startReminder(r);
});

// ── Interacciones (slash commands) ──────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ── /recordatorio ──────────────────────────────────────────────────────────
  if (interaction.commandName === 'recordatorio') {
    const intervalStr = interaction.options.getString('intervalo');
    const channel     = interaction.options.getChannel('canal');
    const message     = interaction.options.getString('mensaje');
    const id          = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '-');
    const ms          = parseInterval(intervalStr);
    if (!ms) return interaction.reply({ content: '❌ Formato inválido. Usá: `30m`, `2h`, `1d`, `90s`', ephemeral: true });
    if (ms < 60000) return interaction.reply({ content: '❌ El intervalo mínimo es 1 minuto.', ephemeral: true });
    const reminders = loadReminders();
    if (reminders.find(r => r.id === id)) return interaction.reply({ content: `❌ Ya existe un recordatorio con el ID \`${id}\`.`, ephemeral: true });
    const reminder = { id, channelId: channel.id, message, intervalMs: ms };
    reminders.push(reminder); saveReminders(reminders); startReminder(reminder);
    return interaction.reply({ content: `✅ Recordatorio \`${id}\` creado.\n📣 Canal: <#${channel.id}>\n⏱ Cada: **${intervalStr.toLowerCase()}**\n💬 Mensaje: ${message}`, ephemeral: true });
  }

  // ── /borrar-recordatorio ───────────────────────────────────────────────────
  if (interaction.commandName === 'borrar-recordatorio') {
    const id        = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '-');
    const reminders = loadReminders();
    const idx       = reminders.findIndex(r => r.id === id);
    if (idx === -1) return interaction.reply({ content: `❌ No encontré ningún recordatorio con el ID \`${id}\`.`, ephemeral: true });
    reminders.splice(idx, 1); saveReminders(reminders);
    if (activeTimers.has(id)) { clearInterval(activeTimers.get(id)); activeTimers.delete(id); }
    return interaction.reply({ content: `✅ Recordatorio \`${id}\` eliminado.`, ephemeral: true });
  }

  // ── /links-permitidos ─────────────────────────────────────────────────────
  if (interaction.commandName === 'links-permitidos') {
    const allowed  = loadAllowedLinks();
    const listText = allowed.length ? allowed.map(d => `• \`${d}\``).join('\n') : '_No hay dominios configurados._';
    return interaction.reply({ content: `🔗 **Dominios permitidos:**\n${listText}`, ephemeral: true });
  }

  // ── /editar-links ──────────────────────────────────────────────────────────
  if (interaction.commandName === 'editar-links') {
    const accion  = interaction.options.getString('accion');
    const dominio = interaction.options.getString('dominio').toLowerCase().trim().replace(/^www\./i, '');
    const allowed = loadAllowedLinks();
    if (accion === 'agregar') {
      if (allowed.includes(dominio)) return interaction.reply({ content: `❌ \`${dominio}\` ya está en la lista.`, ephemeral: true });
      allowed.push(dominio); saveAllowedLinks(allowed);
      return interaction.reply({ content: `✅ \`${dominio}\` agregado.`, ephemeral: true });
    }
    if (accion === 'quitar') {
      const idx = allowed.indexOf(dominio);
      if (idx === -1) return interaction.reply({ content: `❌ \`${dominio}\` no está en la lista.`, ephemeral: true });
      allowed.splice(idx, 1); saveAllowedLinks(allowed);
      return interaction.reply({ content: `✅ \`${dominio}\` eliminado.`, ephemeral: true });
    }
  }

  // ── /nivel ─────────────────────────────────────────────────────────────────
  if (interaction.commandName === 'nivel') {
    await interaction.deferReply({ ephemeral: false });

    const target  = interaction.options.getUser('usuario') || interaction.user;
    const member  = await interaction.guild.members.fetch(target.id).catch(() => null);
    const userData = await levels.getUserData(interaction.guild.id, target.id);

    try {
      const image = await createLevelUpCard({
        username       : target.username,
        avatarUrl      : target.displayAvatarURL({ extension: 'png', size: 512 }),
        guildName      : interaction.guild.name,
        memberCount    : userData?.memberNumber || interaction.guild.memberCount,
        level          : userData?.level          ?? 0,
        currentXp      : userData?.currentXp      ?? 0,
        neededXp       : userData?.neededXp       ?? 100,
        totalMessages  : userData?.messages        ?? 0,
        joinedTimestamp: member?.joinedTimestamp   || userData?.joinedTimestamp || null,
      });
      return interaction.editReply({ files: [new AttachmentBuilder(image, { name: 'nivel.png' })] });
    } catch (err) {
      console.error('Error generando card /nivel:', err);
      return interaction.editReply({ content: '❌ Error generando la tarjeta de nivel.' });
    }
  }

  // ── /ranking ───────────────────────────────────────────────────────────────
  if (interaction.commandName === 'ranking') {
    await interaction.deferReply();
    const top = await levels.getLeaderboard(interaction.guild.id, 10);
    if (!top.length) return interaction.editReply({ content: '📊 Aún no hay datos de niveles en este servidor.' });

    const lines = top.map((u, i) => {
      const medal = ['🥇','🥈','🥉'][i] ?? `**${i + 1}.**`;
      return `${medal} **${u.username ?? `<@${u.userId}>`}** — Nivel ${u.level} • ${u.xp.toLocaleString()} XP • ${(u.messages || 0).toLocaleString()} mensajes`;
    });

    return interaction.editReply({
      content: `🏆 **Top 10 — ${interaction.guild.name}**\n\n${lines.join('\n')}`,
    });
  }
});

// ── Bienvenida ───────────────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  try {
    // Guardar el número de miembro al entrar (posición real)
    await levels.setMemberNumber(member.guild.id, member.id, member.guild.memberCount);

    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel?.isTextBased()) return;
    const image = await createWelcomeImage(member);
    await channel.send({
      content: `👋 Bienvenido ${member}`,
      files  : [new AttachmentBuilder(image, { name: 'welcome.png' })],
    });
  } catch (err) {
    console.error('Error en bienvenida:', err);
  }
});

// ── Mensajes ─────────────────────────────────────────────────────────────────
client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild)     return;

    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);

    if (!isAdmin) {
      // Moderación: link no permitido
      const allowedDomains = loadAllowedLinks();
      const badLink        = findDisallowedLink(message.content, allowedDomains);
      if (badLink) {
        await applyModerationStrike(message, 'Attempting to send links from other channels, this is not allowed.');
        return;
      }
      // Moderación: spam
      if (message.content.trim().length > 0) {
        const spamMessages = registerMessageForSpamCheck(message);
        if (spamMessages) {
          await applyModerationStrike(message, 'Sending repeated messages (spam) is not allowed.', spamMessages);
          return;
        }
      }
    }

    // ── XP por mensaje ──────────────────────────────────────────────────────
    if (message.content.trim().length > 0) {
      const joinedTs = message.member?.joinedTimestamp ?? null;

      // XP extra si es reporte de bug
      if (BUGS_CHANNEL_ID && message.channel.id === BUGS_CHANNEL_ID) {
        const result = await levels.registerBugReport(message.guild.id, message.author.id, message.author.username, joinedTs);
        await handleXpResult(result, message.guild, message.member);
        // También da XP de mensaje normal
      }

      // XP extra si es sugerencia
      if (SUGGEST_CHANNEL_ID && message.channel.id === SUGGEST_CHANNEL_ID) {
        const result = await levels.registerSuggestion(message.guild.id, message.author.id, message.author.username, joinedTs);
        await handleXpResult(result, message.guild, message.member);
      }

      // XP de mensaje (con cooldown 30s)
      const result = await levels.registerMessage(message.guild.id, message.author.id, message.author.username, joinedTs);
      await handleXpResult(result, message.guild, message.member);

      // Actualizar presencia activa
      levels.touchPresence(message.guild.id, message.author.id, message.author.username, joinedTs);
    }

    // ── Comando !welcome (preview) ──────────────────────────────────────────
    if (message.content.toLowerCase() === '!welcome') {
      const image = await createWelcomeImage(message.member);
      await message.reply({ content: '🔍 Vista previa', files: [new AttachmentBuilder(image, { name: 'preview.png' })] });
    }

  } catch (err) {
    console.error('Error en messageCreate:', err);
  }
});

// ── Reacciones ───────────────────────────────────────────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;

    // Si la reacción está parcial, completarla
    if (reaction.partial) {
      await reaction.fetch().catch(() => null);
    }
    if (!reaction.message.guild) return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const result = levels.registerReaction(
      reaction.message.guild.id,
      user.id,
      user.username
    );
    await handleXpResult(result, reaction.message.guild, member);
  } catch (err) {
    console.error('Error en reacción:', err);
  }
});

// ── Arranque ──────────────────────────────────────────────────────────────────
loadFonts().then(() => {
  client.login(TOKEN);
}).catch(err => {
  console.error('Error cargando fuentes:', err);
  client.login(TOKEN);
});
