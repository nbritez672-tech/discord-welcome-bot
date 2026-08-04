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
  const H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Fondo
  const bgPath = path.join(__dirname, 'assets', 'background.jpg');
  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    const scale = Math.max(W / bg.width, H / bg.height);
    const sw = bg.width * scale;
    const sh = bg.height * scale;
    ctx.drawImage(bg, (W - sw) / 2, (H - sh) / 2, sw, sh);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);
  }

  // Oscurecer fondo fuerte para que los textos sean legibles
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, W, H);

  // Gradiente extra oscuro en la mitad inferior (zona de textos)
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.45, W, H * 0.55);

  // ── Avatar ──────────────────────────────────────────────
  const avatarSize = 160;
  const avatarX = W / 2;
  const avatarY = 110;  // centro del círculo

  // Borde blanco circular
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 7, 0, Math.PI * 2);
  ctx.lineWidth = 7;
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
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur = 22;

  // "Welcome"
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 68px sans-serif';
  ctx.fillText('Welcome', W / 2, 255);

  // Username + número de miembro
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#EEEEEE';
  ctx.fillText(`${member.user.username} • #${member.guild.memberCount}`, W / 2, 320);

  // Subtítulo
  ctx.font = 'italic 26px sans-serif';
  ctx.fillStyle = '#CCCCCC';
  ctx.fillText('Have a great moment here!', W / 2, 372);

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
