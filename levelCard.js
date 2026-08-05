/**
 * levelCard.js — Genera la imagen de Level Up estilo "Yin Yang | Script Hub"
 *
 * Diseño fiel a la referencia:
 *  - Fondo: degradado verde oscuro a verde azulado
 *  - Borde superior/inferior: acento verde neón
 *  - Avatar circular con anillo neón verde-cyan
 *  - Textos: "¡LEVEL UP! LEVEL XX", nombre, servidor, badge #miembro
 *  - Panel inferior: SISTEMA DE NIVEL DE CANAL
 *      NIVEL: XX | barra morada→cyan | EXP: actual/total
 *      TOTAL DE MENSAJES: X | TIEMPO ACTIVO: X meses, X días
 */

'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const os   = require('os');
const fs   = require('fs');
const path = require('path');

// ── Registrar fuente Inter (reutiliza el archivo ya descargado por index.js) ─
const FONT_PATH = path.join(os.tmpdir(), 'Inter-Bold.woff2');

async function ensureFont() {
  if (fs.existsSync(FONT_PATH)) {
    GlobalFonts.registerFromPath(FONT_PATH, 'Inter');
    return;
  }
  const url = 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2';
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(FONT_PATH, buf);
  GlobalFonts.registerFromPath(FONT_PATH, 'Inter');
}

// ── Helper: rectángulo redondeado ───────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Helper: tiempo legible ──────────────────────────────────────────────────
function formatActiveTime(joinedTimestamp) {
  if (!joinedTimestamp) return '—';
  const diffMs   = Date.now() - joinedTimestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1)  return 'Hoy';
  if (diffDays < 30) return `${diffDays} día${diffDays !== 1 ? 's' : ''}`;
  const months = Math.floor(diffDays / 30);
  const days   = diffDays % 30;
  const mStr   = `${months} mes${months !== 1 ? 'es' : ''}`;
  return days > 0 ? `${mStr}, ${days} día${days !== 1 ? 's' : ''}` : mStr;
}

// ── Función principal ───────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.avatarUrl
 * @param {string} opts.guildName
 * @param {number} opts.memberCount  — posición/número de miembro
 * @param {number} opts.level
 * @param {number} opts.currentXp    — XP dentro del nivel actual
 * @param {number} opts.neededXp     — XP requerida para el siguiente nivel
 * @param {number} opts.totalMessages
 * @param {number} opts.joinedTimestamp — ms epoch de cuando entró al servidor
 */
async function createLevelUpCard(opts) {
  await ensureFont();

  const {
    username,
    avatarUrl,
    guildName,
    memberCount,
    level,
    currentXp,
    neededXp,
    totalMessages = 0,
    joinedTimestamp,
  } = opts;

  const W = 900;
  const H = 290;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── 1. Fondo degradado verde oscuro ────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,    '#0d2b1e');
  bg.addColorStop(0.45, '#0f3325');
  bg.addColorStop(1,    '#091f17');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Textura sutil: puntos de luz en el fondo
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 120; i++) {
    const rx = Math.random() * W;
    const ry = Math.random() * H;
    const rr = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fillStyle = '#aaffcc';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── 2. Bordes superior e inferior verde neón ────────────────────────────
  const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
  accentGrad.addColorStop(0,   '#00e5a0');
  accentGrad.addColorStop(0.5, '#00ffcc');
  accentGrad.addColorStop(1,   '#00c9b1');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, W, 3);
  ctx.fillRect(0, H - 3, W, 3);

  // ── 3. Avatar ────────────────────────────────────────────────────────────
  const AVT_SIZE = 148;
  const AVT_CX   = 96 + AVT_SIZE / 2;
  const AVT_CY   = H / 2 - 4;

  // Resplandor exterior (glow verde)
  ctx.save();
  ctx.shadowColor = '#00ffcc';
  ctx.shadowBlur  = 28;
  ctx.beginPath();
  ctx.arc(AVT_CX, AVT_CY, AVT_SIZE / 2 + 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#00e5a0';
  ctx.lineWidth   = 4;
  ctx.stroke();
  ctx.restore();

  // Foto del avatar
  try {
    const res    = await fetch(avatarUrl);
    const buf    = Buffer.from(await res.arrayBuffer());
    const avatar = await loadImage(buf);
    ctx.save();
    ctx.beginPath();
    ctx.arc(AVT_CX, AVT_CY, AVT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, AVT_CX - AVT_SIZE / 2, AVT_CY - AVT_SIZE / 2, AVT_SIZE, AVT_SIZE);
    ctx.restore();
  } catch {
    // fallback: círculo gris si falla la descarga
    ctx.beginPath();
    ctx.arc(AVT_CX, AVT_CY, AVT_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#1a4a30';
    ctx.fill();
  }

  // ── 4. Divisor vertical ──────────────────────────────────────────────────
  const DIV_X = 96 + AVT_SIZE + 36;
  const divG  = ctx.createLinearGradient(0, 30, 0, H - 30);
  divG.addColorStop(0,   'rgba(0,229,160,0)');
  divG.addColorStop(0.3, 'rgba(0,229,160,0.5)');
  divG.addColorStop(0.7, 'rgba(0,229,160,0.5)');
  divG.addColorStop(1,   'rgba(0,229,160,0)');
  ctx.fillStyle = divG;
  ctx.fillRect(DIV_X, 28, 2, H - 56);

  // ── 5. Zona de texto (derecha del divisor) ───────────────────────────────
  const TX = DIV_X + 30;

  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur   = 8;

  // "▌ ¡LEVEL UP!  LEVEL XX"
  const tagY = 50;
  ctx.font      = 'bold 13px "Inter"';
  ctx.fillStyle = '#00ffcc';
  ctx.fillText('▌ ¡LEVEL UP!', TX, tagY);
  const barW = ctx.measureText('▌ ¡LEVEL UP!').width;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`  LEVEL ${level}`, TX + barW, tagY);

  // Nombre de usuario
  ctx.font      = 'bold 46px "Inter"';
  ctx.fillStyle = '#ffffff';
  // Truncar si es muy largo
  let displayName = username;
  while (ctx.measureText(displayName).width > W - TX - 30 && displayName.length > 4) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== username) displayName += '…';
  ctx.fillText(displayName, TX, 96);

  // "en Yin Yang | Script Hub"
  ctx.font      = '19px "Inter"';
  ctx.fillStyle = '#5cad8a';
  ctx.fillText(`en ${guildName}`, TX, 136);

  // Badge MIEMBRO #N
  const badgeY  = 162;
  const badgeTxt = `MIEMBRO  #${memberCount}`;
  ctx.font = 'bold 12px "Inter"';
  const badgeTW = ctx.measureText(badgeTxt).width;
  const badgeW2 = badgeTW + 24;
  const badgeH2 = 26;
  ctx.shadowBlur = 0;
  ctx.fillStyle  = 'rgba(0,255,180,0.07)';
  roundRect(ctx, TX, badgeY - badgeH2 / 2, badgeW2, badgeH2, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,229,160,0.35)';
  ctx.lineWidth   = 1;
  roundRect(ctx, TX, badgeY - badgeH2 / 2, badgeW2, badgeH2, 5);
  ctx.stroke();
  ctx.fillStyle   = '#7de8bf';
  ctx.shadowBlur  = 0;
  ctx.fillText(badgeTxt, TX + 12, badgeY);

  // ── 6. Panel de stats ────────────────────────────────────────────────────
  const PANEL_X = TX;
  const PANEL_Y = 183;
  const PANEL_W = W - PANEL_X - 28;
  const PANEL_H = 88;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,229,160,0.2)';
  ctx.lineWidth   = 1;
  roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 8);
  ctx.stroke();

  // Título del panel
  ctx.font      = 'bold 11px "Inter"';
  ctx.fillStyle = '#7de8bf';
  ctx.shadowBlur = 0;
  ctx.fillText('▌ SISTEMA DE NIVEL DE CANAL', PANEL_X + 14, PANEL_Y + 16);

  // NIVEL grande
  ctx.font      = 'bold 22px "Inter"';
  ctx.fillStyle = '#00ffcc';
  ctx.shadowColor = '#00ffcc';
  ctx.shadowBlur  = 10;
  ctx.fillText(`NIVEL: ${level}`, PANEL_X + 14, PANEL_Y + 38);
  ctx.shadowBlur = 0;

  // Barra de progreso XP
  const BAR_X = PANEL_X + 14;
  const BAR_Y = PANEL_Y + 52;
  const BAR_W = Math.floor(PANEL_W * 0.52);
  const BAR_H = 14;
  const BAR_R = 7;
  const progress = Math.min(currentXp / neededXp, 1);

  // Fondo barra
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_R);
  ctx.fill();

  // Relleno barra (degradado morado→cyan, como la referencia)
  if (progress > 0) {
    const fillW = Math.max(BAR_H, Math.floor(BAR_W * progress));
    const barFill = ctx.createLinearGradient(BAR_X, 0, BAR_X + BAR_W, 0);
    barFill.addColorStop(0,   '#a855f7');
    barFill.addColorStop(0.5, '#38bdf8');
    barFill.addColorStop(1,   '#00e5c8');
    ctx.fillStyle = barFill;
    roundRect(ctx, BAR_X, BAR_Y, fillW, BAR_H, BAR_R);
    ctx.fill();

    // Brillo en la barra
    const shine = ctx.createLinearGradient(BAR_X, BAR_Y, BAR_X, BAR_Y + BAR_H);
    shine.addColorStop(0,   'rgba(255,255,255,0.25)');
    shine.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    roundRect(ctx, BAR_X, BAR_Y, fillW, BAR_H, BAR_R);
    ctx.fill();
  }

  // EXP: X / Y
  ctx.font      = '11px "Inter"';
  ctx.fillStyle = '#a0d4bc';
  ctx.fillText(`EXP: ${currentXp.toLocaleString()} / ${neededXp.toLocaleString()}`, BAR_X, BAR_Y + BAR_H + 13);

  // Columna derecha: TOTAL MENSAJES + TIEMPO ACTIVO
  const STATS_X = PANEL_X + 14 + BAR_W + 20;
  ctx.font      = 'bold 11px "Inter"';
  ctx.fillStyle = '#7de8bf';
  ctx.fillText('TOTAL DE MENSAJES:', STATS_X, PANEL_Y + 34);
  ctx.font      = 'bold 14px "Inter"';
  ctx.fillStyle = '#00e5a0';
  ctx.fillText(totalMessages.toLocaleString(), STATS_X + ctx.measureText('TOTAL DE MENSAJES:  ').width - 2, PANEL_Y + 34);

  ctx.font      = 'bold 11px "Inter"';
  ctx.fillStyle = '#7de8bf';
  ctx.fillText('TIEMPO ACTIVO:', STATS_X, PANEL_Y + 54);

  ctx.font      = 'bold 14px "Inter"';
  ctx.fillStyle = '#00e5a0';
  ctx.shadowColor = '#00e5a0';
  ctx.shadowBlur  = 6;
  ctx.fillText(formatActiveTime(joinedTimestamp), STATS_X, PANEL_Y + 70);
  ctx.shadowBlur = 0;

  // ── 7. Destello decorativo (esquina inferior derecha) ────────────────────
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.font        = '42px "Inter"';
  ctx.fillStyle   = '#00ffcc';
  ctx.textAlign   = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('✦', W - 18, H - 12);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

module.exports = { createLevelUpCard };
