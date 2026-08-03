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
  const canvas = createCanvas(1600, 900);
  const ctx = canvas.getContext('2d');

  const bgPath = path.join(__dirname, 'assets', 'background.jpg');

  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  roundRect(ctx, 90, 60, 1420, 780, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();

  const avatarURL = member.user.displayAvatarURL({
    extension: 'png',
    size: 512
  });

  const response = await fetch(avatarURL);
  const buffer = Buffer.from(await response.arrayBuffer());
  const avatar = await loadImage(buffer);

  const avatarSize = 250;
  const avatarX = canvas.width / 2 - avatarSize / 2;
  const avatarY = 70;

  ctx.save();
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2
  );
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    avatar,
    avatarX,
    avatarY,
    avatarSize,
    avatarSize
  );
  ctx.restore();

  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2 + 6,
    0,
    Math.PI * 2
  );

  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 15;

  ctx.fillStyle = '#ffffff';

  ctx.font = '90px Arial';
  ctx.fillText('WELCOME', 800, 430);

  ctx.font = '55px Arial';
  ctx.fillText(member.user.username, 800, 520);

  ctx.font = '38px Arial';
  ctx.fillText(getMemberTag(member), 800, 590);

  ctx.font = '30px Arial';
  ctx.fillText(
    `Miembros: ${member.guild.memberCount}`,
    800,
    680
  );

  ctx.font = '28px Arial';
  ctx.fillText(
    'Have a great moment here!',
    800,
    740
  );

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
