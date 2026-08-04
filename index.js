require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  AttachmentBuilder
} = require('discord.js');

const {
  createCanvas,
  loadImage,
  GlobalFonts
} = require('@napi-rs/canvas');

const os = require('os');
const fs = require('fs');
const path = require('path');

// Descargar y registrar fuente al arrancar — garantizado en cualquier entorno
async function loadFonts() {
  const fontUrl = 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2';
  const fontPath = path.join(os.tmpdir(), 'Inter-Bold.woff2');
  if (!fs.existsSync(fontPath)) {
    const res = await fetch(fontUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(fontPath, buf);
  }
  GlobalFonts.registerFromPath(fontPath, 'Inter');
  console.log('✅ Fuente Inter registrada');
}

const TOKEN = process.env.TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

if (!TOKEN) {
  console.error('Falta TOKEN.');
  process.exit(1);
}

if (!WELCOME_CHANNEL_ID) {
  console.error('Falta WELCOME_CHANNEL_ID.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

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

  // ── Fondo: degradado oscuro azulado igual a la referencia ──
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0,   '#1a1c2e');
  bgGrad.addColorStop(0.5, '#1e2235');
  bgGrad.addColorStop(1,   '#16182a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Borde exterior sutil (línea superior degradado rosa-azul como la referencia)
  const borderGrad = ctx.createLinearGradient(0, 0, W, 0);
  borderGrad.addColorStop(0,   '#ff6ec7');
  borderGrad.addColorStop(0.5, '#a78bfa');
  borderGrad.addColorStop(1,   '#60a5fa');
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, 0, W, 3);

  // Borde inferior mismo degradado
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, H - 3, W, 3);

  // ── Avatar ──────────────────────────────────────────────
  const avatarSize = 140;
  const avatarX    = 80 + avatarSize / 2;   // centro X
  const avatarY    = H / 2;                  // centro Y

  // Anillo degradado alrededor del avatar
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

  // Foto del avatar con clip circular
  const avatarResponse = await fetch(
    member.user.displayAvatarURL({ extension: 'png', size: 512 })
  );
  const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());
  const avatar = await loadImage(avatarBuffer);

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(
    avatar,
    avatarX - avatarSize / 2,
    avatarY - avatarSize / 2,
    avatarSize,
    avatarSize
  );
  ctx.restore();

  // ── Línea divisora vertical ──────────────────────────────
  const divX = 80 + avatarSize + 40;
  const divGrad = ctx.createLinearGradient(0, 40, 0, H - 40);
  divGrad.addColorStop(0,   'rgba(167,139,250,0)');
  divGrad.addColorStop(0.3, 'rgba(167,139,250,0.8)');
  divGrad.addColorStop(0.7, 'rgba(167,139,250,0.8)');
  divGrad.addColorStop(1,   'rgba(167,139,250,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(divX, 40, 2, H - 80);

  // ── Textos (zona derecha) ────────────────────────────────
  const textX = divX + 36;
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur   = 10;

  // "✦ ¡BIENVENIDO/A AL SERVIDOR! ✦"
  ctx.textAlign = 'left';
  ctx.font      = 'bold 13px "Inter"';
  const tagGrad = ctx.createLinearGradient(textX, 0, textX + 340, 0);
  tagGrad.addColorStop(0, '#ff6ec7');
  tagGrad.addColorStop(1, '#60a5fa');
  ctx.fillStyle = tagGrad;
  ctx.fillText('✦  ¡BIENVENIDO/A AL SERVIDOR!  ✦', textX, 88);

  // Nombre de usuario — grande y blanco
  ctx.font      = 'bold 52px "Inter"';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(member.user.username, textX, 148);

  // "en Yin Yang | Script Hub"
  ctx.font      = '22px "Inter"';
  ctx.fillStyle = '#8b9dc3';
  ctx.fillText(`en ${member.guild.name}`, textX, 196);

  // Badge "🛡 MIEMBRO  #52"
  const badgeX = textX;
  const badgeY = 228;
  const badgeW = 180;
  const badgeH = 30;
  ctx.shadowBlur = 0;

  // Fondo del badge
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, badgeX, badgeY - badgeH / 2, badgeW, badgeH, 6);
  ctx.fill();

  // Borde del badge
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth   = 1;
  roundRect(ctx, badgeX, badgeY - badgeH / 2, badgeW, badgeH, 6);
  ctx.stroke();

  // Texto del badge
  ctx.font      = 'bold 13px "Inter"';
  ctx.fillStyle = '#c0cde8';
  ctx.textAlign = 'left';
  ctx.fillText(`MIEMBRO  #${member.guild.memberCount}`, badgeX + 10, badgeY);

  return canvas.toBuffer('image/png');
}

client.once('ready', () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
  try {
    const channel = await member.guild.channels.fetch(
      WELCOME_CHANNEL_ID
    );

    if (!channel?.isTextBased()) return;

    const image = await createWelcomeImage(member);

    await channel.send({
      content: `👋 Bienvenido ${member}`,
      files: [
        new AttachmentBuilder(image, {
          name: 'welcome.png'
        })
      ]
    });
  } catch (err) {
    console.error('Error en bienvenida:', err);
  }
});

client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;

    if (message.content.toLowerCase() === '!welcome') {
      const image = await createWelcomeImage(
        message.member
      );

      await message.reply({
        content: '🔍 Vista previa',
        files: [
          new AttachmentBuilder(image, {
            name: 'preview.png'
          })
        ]
      });
    }
  } catch (err) {
    console.error('Error en !welcome:', err);
  }
});

loadFonts().then(() => {
  client.login(TOKEN);
}).catch(err => {
  console.error('Error cargando fuentes:', err);
  client.login(TOKEN);
});
