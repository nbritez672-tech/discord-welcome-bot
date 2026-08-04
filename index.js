require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  AttachmentBuilder
} = require('discord.js');

const {
  createCanvas,
  loadImage
} = require('@napi-rs/canvas');

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
  const W = 1100;
  const H = 450;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Fondo
  const bgPath = path.join(__dirname, 'assets', 'background.jpg');
  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    // Escalar cubriendo todo el canvas (object-fit: cover)
    const scale = Math.max(W / bg.width, H / bg.height);
    const sw = bg.width * scale;
    const sh = bg.height * scale;
    ctx.drawImage(bg, (W - sw) / 2, (H - sh) / 2, sw, sh);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);
  }

  // Oscurecer fondo para legibilidad
  ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
  ctx.fillRect(0, 0, W, H);

  // ── Avatar ──────────────────────────────────────────────
  const avatarSize = 180;
  const avatarX = W / 2;
  const avatarY = 130;

  // Sombra del círculo
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fill();
  ctx.restore();

  // Borde blanco circular
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 7, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  // Clip circular para el avatar
  const avatarResponse = await fetch(
    member.user.displayAvatarURL({ extension: 'png', size: 512 })
  );
  const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());
  const avatar = await loadImage(avatarBuffer);

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
  ctx.restore();

  // ── Textos ───────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Sombra general para todos los textos
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 18;

  // "Welcome"
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 72px sans-serif';
  ctx.fillText('Welcome', W / 2, 290);

  // Username
  ctx.font = 'bold 38px sans-serif';
  ctx.fillStyle = '#E0E0E0';
  ctx.fillText(member.user.username, W / 2, 355);

  // Subtítulo
  ctx.font = 'italic 28px sans-serif';
  ctx.fillStyle = '#CCCCCC';
  ctx.fillText('Have a great moment here!', W / 2, 405);

  ctx.shadowBlur = 0;

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

client.login(TOKEN);
