require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

function getMemberTag(member) {
  const roles = member.roles.cache
    .filter(role => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);

  if (roles.size === 0) return 'Miembro';
  return roles.first().name;
}

client.once('ready', () => {
  console.log(`Bot listo como ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
  try {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const tag = getMemberTag(member);

    const embed = new EmbedBuilder()
      .setColor(0x8bc34a)
      .setTitle('Bienvenido')
      .setDescription(
        `👋 Hola ${member}, bienvenido a **${member.guild.name}**.\n🏷️ Tu etiqueta: **${tag}**`
      )
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `Miembros del servidor: ${member.guild.memberCount}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error en bienvenida:', error);
  }
});

client.login(TOKEN);
