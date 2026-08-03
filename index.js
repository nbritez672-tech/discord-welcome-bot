require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const TOKEN = process.env.TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

if (!TOKEN) {
  console.error('Falta TOKEN en las variables de entorno.');
  process.exit(1);
}

if (!WELCOME_CHANNEL_ID) {
  console.error('Falta WELCOME_CHANNEL_ID en las variables de entorno.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function getMemberTag(member) {
  const roles = [...member.roles.cache.values()]
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);

  if (roles.length === 0) return 'Miembro';
  return roles[0].name;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const nw = img.width * scale;
  const nh = img.height * scale;
  const nx = x + (w - nw) / 2;
  const ny = y + (h - nh) / 2;
  ctx.drawImage(img, nx, ny, nw, nh);
}

async function createWelcomeImage(member) {
  const canvas = createCanvas(1600, 900);
  const ctx = canvas.getContext('2d');

  const bgPath = path.join(__dirname, 'assets', 'background.jpg');
  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    drawCoverImage(ctx, bg, 0, 0, canvas.width, canvas.height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 1600, 900);
    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(1, '#2b2b2b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundRect(ctx, 120, 70, 1360, 760, 40);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 4;
  roundRect(ctx, 120, 70, 1360, 760, 40);
  ctx.stroke();

  const avatarURL = member.displayAvatarURL({ extension: 'png', size: 512 });
  const avatarResponse = await fetch(avatarURL);
  const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());
  const avatar = await loadImage(avatarBuffer);

  const avatarX = 800;
  const avatarY = 205;
  const avatarR = 120;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR + 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
  ctx.restore();

  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 96px sans-serif';
  ctx.fillText('WELCOME', 800, 455);

  ctx.font = 'bold 54px sans-serif';
  ctx.fillText(member.displayName, 800, 545);

  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(`Tu etiqueta: ${getMemberTag(member)}`, 800, 610);

  ctx.font = '30px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText(`Bienvenido a ${member.guild.name}`, 800, 705);

  ctx.font = '24px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillText('Have a great moment here!', 800, 760);

  return canvas.toBuffer('image/png');
}

client.once('ready', () => {
  console.log(`Bot listo como ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
  try {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const imageBuffer = await createWelcomeImage(member);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });

    await channel.send({
      content: `👋 Bienvenido ${member}`,
      files: [attachment],
    });
  } catch (error) {
    console.error('Error enviando bienvenida:', error);
  }
});

client.login(TOKEN);
