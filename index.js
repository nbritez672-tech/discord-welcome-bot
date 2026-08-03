require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const TOKEN = process.env.TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

function getMemberTag(member) {
  const roles = member.roles.cache
    .filter(role => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);

  if (roles.size === 0) return 'Miembro';

  return roles.first().name;
}

async function createWelcomeImage(member) {
  const canvas = createCanvas(1200, 500);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 1200, 500);
  gradient.addColorStop(0, '#6ab7ff');
  gradient.addColorStop(1, '#8bc34a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(200, 250, 110, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatarResponse = await fetch(avatarURL);
  const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());
  const avatar = await require('canvas').loadImage(avatarBuffer);

  ctx.save();
  ctx.beginPath();
  ctx.arc(200, 250, 100, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, 100, 150, 200, 200);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 70px sans-serif';
  ctx.fillText('Welcome', 360, 190);

  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(member.user.username, 360, 260);

  ctx.font = '30px sans-serif';
  ctx.fillText(`Etiqueta: ${getMemberTag(member)}`, 360, 320);

  ctx.font = '26px sans-serif';
  ctx.fillText(`Bienvenido a ${member.guild.name}`, 360, 380);

  return canvas.toBuffer('image/png');
}

client.once('ready', () => {
  console.log(`Bot listo como ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
  try {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const image = await createWelcomeImage(member);
    const attachment = new AttachmentBuilder(image, { name: 'welcome.png' });

    await channel.send({
      content: `👋 Bienvenido ${member} !`,
      files: [attachment]
    });
  } catch (error) {
    console.error('Error en bienvenida:', error);
  }
});

client.login(TOKEN);
