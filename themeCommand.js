/**
 * themeCommand.js — Comando /tema para Yin Yang | Script Hub
 *
 * Flujo:
 *  1. Usuario (Owner/Admin) usa /tema nombre:<nombre> imagen:<adjunto>
 *  2. Bot descarga la imagen y extrae la paleta de 8 colores automáticamente
 *  3. Sube la imagen a Roblox Open Cloud como asset (Image)
 *  4. Obtiene el assetId resultante
 *  5. Lee YinYang_Themes.lua desde GitHub, agrega el nuevo tema e incrementa Version
 *  6. Hace commit del archivo actualizado a GitHub
 *  7. Responde en Discord con un embed de confirmación
 */

'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// ── Variables de entorno ──────────────────────────────────────────────────────
const GITHUB_TOKEN    = process.env.GITHUB_TOKEN;
const GITHUB_REPO     = process.env.GITHUB_REPO;       // "Yinyangzx/Temas"
const GITHUB_FILE     = process.env.GITHUB_FILE_PATH;  // "YinYang_Themes.lua"
const GITHUB_BRANCH   = process.env.GITHUB_BRANCH || 'main';
const ROBLOX_API_KEY  = process.env.ROBLOX_API_KEY;

// ── Nombres de roles con permiso ──────────────────────────────────────────────
const ALLOWED_ROLES = ['Owner', 'Admin'];

// ═════════════════════════════════════════════════════════════════════════════
//  UTILIDADES DE COLOR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Convierte un color hex (#RRGGBB) a { r, g, b }
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Distancia euclidiana entre dos colores RGB
 */
function colorDistance(a, b) {
  return Math.sqrt(
    Math.pow(a.r - b.r, 2) +
    Math.pow(a.g - b.g, 2) +
    Math.pow(a.b - b.b, 2)
  );
}

/**
 * Calcula la luminancia relativa de un color (para detectar si es claro u oscuro)
 */
function luminance(r, g, b) {
  const toLinear = c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Extrae una paleta de N colores representativos de un buffer de imagen PNG/JPEG
 * usando k-means simplificado sobre píxeles muestreados.
 *
 * Devuelve un array de { r, g, b } ordenados de más oscuro a más claro.
 */
async function extractPalette(imageBuffer, k = 8) {
  // Usamos @napi-rs/canvas que ya está instalado en el proyecto
  const { createCanvas, loadImage } = require('@napi-rs/canvas');

  const img    = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx    = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

  // Muestrear hasta 2000 píxeles distribuidos uniformemente
  const pixels = [];
  const step   = Math.max(1, Math.floor((width * height) / 2000));
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue; // ignorar transparentes
    pixels.push({ r, g, b });
  }

  if (pixels.length === 0) {
    // fallback si la imagen es rara
    return Array(k).fill({ r: 128, g: 128, b: 128 });
  }

  // ── K-Means (10 iteraciones) ───────────────────────────────────────────────
  // Inicializar centroides con k-means++ simplificado (escoger píxeles dispersos)
  let centroids = [pixels[Math.floor(Math.random() * pixels.length)]];
  while (centroids.length < k) {
    // Escoger el pixel más lejano de los centroides actuales
    let maxDist = -1, best = null;
    const sample = pixels.filter((_, i) => i % 20 === 0); // subsample
    for (const p of sample) {
      const minD = Math.min(...centroids.map(c => colorDistance(p, c)));
      if (minD > maxDist) { maxDist = minD; best = p; }
    }
    centroids.push(best || pixels[Math.floor(Math.random() * pixels.length)]);
  }

  for (let iter = 0; iter < 10; iter++) {
    // Asignar cada píxel al centroide más cercano
    const clusters = Array.from({ length: k }, () => []);
    for (const p of pixels) {
      let minD = Infinity, idx = 0;
      for (let c = 0; c < k; c++) {
        const d = colorDistance(p, centroids[c]);
        if (d < minD) { minD = d; idx = c; }
      }
      clusters[idx].push(p);
    }
    // Recalcular centroides
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) continue;
      const avg = clusters[c].reduce((acc, p) => ({
        r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b
      }), { r: 0, g: 0, b: 0 });
      centroids[c] = {
        r: Math.round(avg.r / clusters[c].length),
        g: Math.round(avg.g / clusters[c].length),
        b: Math.round(avg.b / clusters[c].length),
      };
    }
  }

  // Ordenar de más oscuro a más claro
  return centroids.sort((a, b) =>
    luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b)
  );
}

/**
 * A partir de una paleta de colores ordenada (oscuro→claro), asigna
 * los 8 campos de Yin Yang de forma inteligente:
 *
 * Background  → el más oscuro
 * Secondary   → segundo más oscuro
 * AccentOff   → tercero
 * Text        → el más claro (para que se lea)
 * TextDim     → segundo más claro
 * Stroke      → color medio con más saturación
 * Accent      → color más saturado/vibrante
 * ToggleOn    → igual que Accent (o el más saturado disponible)
 */
function buildPaletteAssignment(colors) {
  // Calcular saturación HSL de cada color
  function getSaturation({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return 0;
    const d = max - min;
    return l > 0.5 ? d / (2 - max - min) : d / (max + min);
  }

  // Copia ordenada por luminancia (ya viene ordenada, pero la dejamos)
  const byLum = [...colors];

  // El más saturado → Accent / ToggleOn
  const bySat   = [...colors].sort((a, b) => getSaturation(b) - getSaturation(a));
  const accent   = bySat[0];
  const toggleOn = bySat[0];

  // Stroke → segundo más saturado
  const stroke = bySat[1] || bySat[0];

  return {
    Background : byLum[0],
    Secondary  : byLum[1],
    AccentOff  : byLum[2],
    Text       : byLum[7],
    TextDim    : byLum[6],
    Stroke     : stroke,
    Accent     : accent,
    ToggleOn   : toggleOn,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ROBLOX — SUBIR IMAGEN COMO ASSET
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Sube una imagen a Roblox Open Cloud y retorna el assetId numérico.
 * Usa la API de Assets v1: POST /assets/v1/assets (multipart/form-data)
 *
 * Docs: https://create.roblox.com/docs/cloud/reference/Assets
 */
async function uploadImageToRoblox(imageBuffer, mimeType, themeName) {
  const FormData = (await import('node:stream')).Writable; // usamos fetch nativo de Node 22

  // Construir multipart/form-data manualmente (Node 22 tiene FormData global)
  const form = new globalThis.FormData();

  // Metadata del asset en JSON
  const metadata = JSON.stringify({
    assetType   : 'Image',
    displayName : `YinYang Theme: ${themeName}`,
    description : `Tema ${themeName} para Yin Yang UI Library`,
    creationContext: {
      creator: { userId: null }, // null → usa el creador del API key
    }
  });

  form.append('request', new Blob([metadata], { type: 'application/json' }));
  form.append('fileContent', new Blob([imageBuffer], { type: mimeType }), `${themeName}.png`);

  const res = await fetch('https://apis.roblox.com/assets/v1/assets', {
    method : 'POST',
    headers: { 'x-api-key': ROBLOX_API_KEY },
    body   : form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Roblox upload failed (${res.status}): ${errText}`);
  }

  const json = await res.json();

  // La API devuelve una operación async. Necesitamos polling.
  const operationPath = json.path; // ej: "operations/abc123"
  if (!operationPath) throw new Error('Roblox no devolvió un operation path');

  return await pollRobloxOperation(operationPath);
}

/**
 * Hace polling a una operación de Roblox hasta que esté lista (max ~60s)
 * Retorna el assetId numérico como string: "rbxassetid://XXXXX"
 */
async function pollRobloxOperation(operationPath) {
  const url     = `https://apis.roblox.com/${operationPath}`;
  const headers = { 'x-api-key': ROBLOX_API_KEY };
  const maxTries = 20;
  const delay    = 3000; // 3s entre intentos

  for (let i = 0; i < maxTries; i++) {
    await new Promise(r => setTimeout(r, delay));

    const res  = await fetch(url, { headers });
    if (!res.ok) continue;
    const json = await res.json();

    if (json.done) {
      const assetId = json.response?.assetId || json.response?.asset?.assetId;
      if (!assetId) throw new Error('Operación completada pero sin assetId');
      return `rbxassetid://${assetId}`;
    }
    // Si hay error en la operación
    if (json.error) throw new Error(`Roblox operation error: ${JSON.stringify(json.error)}`);
  }

  throw new Error('Timeout esperando a que Roblox procese la imagen (60s)');
}

// ═════════════════════════════════════════════════════════════════════════════
//  GITHUB — LEER Y ACTUALIZAR EL ARCHIVO .LUA
// ═════════════════════════════════════════════════════════════════════════════

const GITHUB_API = 'https://api.github.com';

/**
 * Lee el archivo .lua de GitHub y retorna { content: string, sha: string }
 */
async function readGitHubFile() {
  const url = `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept       : 'application/vnd.github+json',
    }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub read failed (${res.status}): ${err}`);
  }

  const json    = await res.json();
  const content = Buffer.from(json.content, 'base64').toString('utf8');
  return { content, sha: json.sha };
}

/**
 * Hace commit del nuevo contenido al archivo .lua en GitHub
 */
async function writeGitHubFile(content, sha, commitMessage) {
  const url  = `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const body = JSON.stringify({
    message: commitMessage,
    content: Buffer.from(content, 'utf8').toString('base64'),
    sha,
    branch : GITHUB_BRANCH,
  });

  const res = await fetch(url, {
    method : 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept       : 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write failed (${res.status}): ${err}`);
  }

  return await res.json();
}

/**
 * Incrementa el número de Version en el archivo .lua
 * Busca: Version = N,   y lo reemplaza con Version = N+1,
 */
function incrementVersion(luaContent) {
  return luaContent.replace(
    /(\bVersion\s*=\s*)(\d+)/,
    (_, prefix, num) => `${prefix}${parseInt(num) + 1}`
  );
}

/**
 * Agrega un nuevo tema al archivo .lua:
 * - Lo inserta justo antes del cierre de la tabla Themes (antes de la última línea `},`)
 * - Agrega el nombre al array Order
 */
function injectTheme(luaContent, themeName, palette, assetId) {
  const p = palette;

  // Bloque Lua del nuevo tema
  const themeBlock = `
        --// ════════════════════════════════════════════════════════════════
        --// TEMA: ${themeName} (generado automáticamente por el bot)
        --// ════════════════════════════════════════════════════════════════

        ${themeName} = {
            Palette = {
                Background = RGB(${p.Background.r}, ${p.Background.g}, ${p.Background.b}),
                Secondary  = RGB(${p.Secondary.r}, ${p.Secondary.g}, ${p.Secondary.b}),
                AccentOff  = RGB(${p.AccentOff.r}, ${p.AccentOff.g}, ${p.AccentOff.b}),
                Text       = RGB(${p.Text.r}, ${p.Text.g}, ${p.Text.b}),
                TextDim    = RGB(${p.TextDim.r}, ${p.TextDim.g}, ${p.TextDim.b}),
                Stroke     = RGB(${p.Stroke.r}, ${p.Stroke.g}, ${p.Stroke.b}),
                Accent     = RGB(${p.Accent.r}, ${p.Accent.g}, ${p.Accent.b}),
                ToggleOn   = RGB(${p.ToggleOn.r}, ${p.ToggleOn.g}, ${p.ToggleOn.b}),
            },
            Sound      = DEFAULT_SOUND,
            Background = "${assetId}",
            Effect     = "Off",
        },
`;

  // Insertar el tema antes del cierre de Themes = { ... }
  // Buscamos el último `},` seguido de espacios/newline y `}` que cierra Themes
  // La estructura del archivo termina con:
  //     },         ← cierre del último tema
  //   },           ← cierre de Themes
  // }              ← cierre del return
  //
  // Buscamos el patrón: \n    },\n\n} al final del archivo
  const closePattern = /(\n\s*},\s*\n\n\}\s*\n?)$/;
  if (closePattern.test(luaContent)) {
    luaContent = luaContent.replace(closePattern, `${themeBlock}\n    },\n\n}\n`);
  } else {
    // fallback: insertar antes del último `},`
    const lastClose = luaContent.lastIndexOf('\n    },');
    if (lastClose !== -1) {
      luaContent = luaContent.slice(0, lastClose) + themeBlock + luaContent.slice(lastClose);
    }
  }

  // Agregar el nombre al Order array — buscamos la última entrada antes del cierre de Order
  // Patrón: "NombreUltimo",\n    },
  luaContent = luaContent.replace(
    /("[\w]+")(,?\s*\n(\s*)},\s*\n\s*--\/\/ Todos los temas)/,
    `$1,\n        "${themeName}"$2`
  );

  // Si el patrón anterior no matcheó, buscar el cierre de Order de otra forma
  if (!luaContent.includes(`"${themeName}"`)) {
    luaContent = luaContent.replace(
      /(Order\s*=\s*\{[\s\S]*?)(\s*\},)/,
      (match, body, close) => {
        // Agregar al final del Order
        return body.trimEnd() + `,\n        "${themeName}"\n    }` + close.slice(close.indexOf('},') + 2);
      }
    );
  }

  return luaContent;
}

// ═════════════════════════════════════════════════════════════════════════════
//  DEFINICIÓN DEL COMANDO SLASH
// ═════════════════════════════════════════════════════════════════════════════

const temaCommand = new SlashCommandBuilder()
  .setName('tema')
  .setDescription('Agrega un nuevo tema a Yin Yang UI Library')
  .addStringOption(opt =>
    opt.setName('nombre')
      .setDescription('Nombre del tema (ej: MiTemaV1). Sin espacios.')
      .setRequired(true)
  )
  .addAttachmentOption(opt =>
    opt.setName('imagen')
      .setDescription('Imagen de fondo del tema (PNG o JPG recomendado)')
      .setRequired(true)
  );

// ═════════════════════════════════════════════════════════════════════════════
//  HANDLER DEL COMANDO
// ═════════════════════════════════════════════════════════════════════════════

async function handleTemaCommand(interaction) {
  // ── 1. Verificar permisos por rol ─────────────────────────────────────────
  const memberRoles = interaction.member.roles.cache;
  const hasPermission = memberRoles.some(r => ALLOWED_ROLES.includes(r.name));

  if (!hasPermission) {
    return interaction.reply({
      content : '❌ Solo los roles **Owner** y **Admin** pueden usar este comando.',
      ephemeral: true,
    });
  }

  // ── 2. Obtener opciones ───────────────────────────────────────────────────
  const themeName  = interaction.options.getString('nombre').trim().replace(/\s+/g, '');
  const attachment = interaction.options.getAttachment('imagen');

  // Validar nombre (solo letras y números, sin espacios)
  if (!/^[a-zA-Z0-9]+$/.test(themeName)) {
    return interaction.reply({
      content : '❌ El nombre del tema solo puede contener letras y números, sin espacios ni caracteres especiales.',
      ephemeral: true,
    });
  }

  // Validar que sea imagen
  if (!attachment.contentType?.startsWith('image/')) {
    return interaction.reply({
      content : '❌ El archivo adjunto debe ser una imagen (PNG, JPG, WebP).',
      ephemeral: true,
    });
  }

  // ── 3. Defer (el proceso tarda ~30-60s) ──────────────────────────────────
  await interaction.deferReply();

  try {
    // ── 4. Descargar la imagen ──────────────────────────────────────────────
    await interaction.editReply({ content: '⏳ **[1/4]** Descargando imagen...' });

    const imgRes    = await fetch(attachment.url);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const mimeType  = attachment.contentType || 'image/png';

    // ── 5. Extraer paleta de colores ────────────────────────────────────────
    await interaction.editReply({ content: '🎨 **[2/4]** Analizando colores de la imagen...' });

    const rawColors = await extractPalette(imgBuffer, 8);
    const palette   = buildPaletteAssignment(rawColors);

    // ── 6. Subir imagen a Roblox ────────────────────────────────────────────
    await interaction.editReply({ content: '🚀 **[3/4]** Subiendo imagen a Roblox...' });

    const robloxAssetId = await uploadImageToRoblox(imgBuffer, mimeType, themeName);

    // ── 7. Actualizar GitHub ────────────────────────────────────────────────
    await interaction.editReply({ content: '📝 **[4/4]** Actualizando archivo de temas en GitHub...' });

    const { content: luaContent, sha } = await readGitHubFile();

    // Verificar que el tema no exista ya
    if (luaContent.includes(`${themeName} =`)) {
      return interaction.editReply({
        content: `❌ Ya existe un tema con el nombre \`${themeName}\` en el archivo. Elige otro nombre.`,
      });
    }

    // Inyectar tema e incrementar versión
    let newContent = injectTheme(luaContent, themeName, palette, robloxAssetId);
    newContent     = incrementVersion(newContent);

    await writeGitHubFile(
      newContent,
      sha,
      `✨ Tema ${themeName} agregado por ${interaction.user.username} via Discord Bot`
    );

    // ── 8. Respuesta final ──────────────────────────────────────────────────
    const p = palette;
    const embed = new EmbedBuilder()
      .setTitle(`✅ Tema \`${themeName}\` agregado exitosamente`)
      .setColor(0x00ffcc)
      .setThumbnail(attachment.url)
      .addFields(
        {
          name : '🎨 Paleta generada',
          value:
            `\`Background\` → RGB(${p.Background.r}, ${p.Background.g}, ${p.Background.b})\n` +
            `\`Secondary\`  → RGB(${p.Secondary.r}, ${p.Secondary.g}, ${p.Secondary.b})\n` +
            `\`AccentOff\`  → RGB(${p.AccentOff.r}, ${p.AccentOff.g}, ${p.AccentOff.b})\n` +
            `\`Text\`       → RGB(${p.Text.r}, ${p.Text.g}, ${p.Text.b})\n` +
            `\`TextDim\`    → RGB(${p.TextDim.r}, ${p.TextDim.g}, ${p.TextDim.b})\n` +
            `\`Stroke\`     → RGB(${p.Stroke.r}, ${p.Stroke.g}, ${p.Stroke.b})\n` +
            `\`Accent\`     → RGB(${p.Accent.r}, ${p.Accent.g}, ${p.Accent.b})\n` +
            `\`ToggleOn\`   → RGB(${p.ToggleOn.r}, ${p.ToggleOn.g}, ${p.ToggleOn.b})`,
          inline: false,
        },
        { name: '🖼️ Asset ID en Roblox', value: `\`${robloxAssetId}\``, inline: false },
        { name: '📁 Archivo actualizado', value: `\`${GITHUB_FILE}\` en \`${GITHUB_REPO}\``, inline: false },
        { name: '👤 Creado por', value: `${interaction.user}`, inline: true },
      )
      .setFooter({ text: 'La versión del archivo fue incrementada automáticamente' })
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [embed] });

  } catch (err) {
    console.error('Error en /tema:', err);
    await interaction.editReply({
      content: `❌ Ocurrió un error: \`${err.message}\`\nRevisa los logs para más detalles.`,
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

module.exports = { temaCommand, handleTemaCommand };
