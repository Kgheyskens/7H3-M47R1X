const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('./configStore');

const DEFAULT_WELCOME =
    'Welcome to {server}, {user}! 🎯 Check out the rules and grab your rank & agent roles to get started. GLHF!';
const DEFAULT_GOODBYE = '{username} has left {server}. GG, see you on the battlefield. 👋';

function formatMessage(template, { username, mention, guildName, memberCount }) {
    return template
        .replaceAll('{user}', mention)
        .replaceAll('{username}', username)
        .replaceAll('{server}', guildName)
        .replaceAll('{membercount}', String(memberCount));
}

async function sendWelcome(member) {
    const config = await getConfig(member.guild.id);
    if (!config.welcome_enabled || !config.welcome_channel_id) return;

    const channel = await member.guild.channels.fetch(config.welcome_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const text = formatMessage(config.welcome_message || DEFAULT_WELCOME, {
        username: member.user.username,
        mention: `${member}`,
        guildName: member.guild.name,
        memberCount: member.guild.memberCount,
    });

    await channel
        .send({ embeds: [new EmbedBuilder().setColor(0xff4655).setDescription(text)] })
        .catch((error) => console.error(`Could not send welcome message in guild ${member.guild.id}:`, error.message));
}

async function sendGoodbye(guild, user) {
    const config = await getConfig(guild.id);
    if (!config.goodbye_enabled || !config.goodbye_channel_id) return;

    const channel = await guild.channels.fetch(config.goodbye_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const text = formatMessage(config.goodbye_message || DEFAULT_GOODBYE, {
        username: user.username,
        mention: `${user}`,
        guildName: guild.name,
        memberCount: guild.memberCount,
    });

    await channel
        .send({ embeds: [new EmbedBuilder().setColor(0x2f3136).setDescription(text)] })
        .catch((error) => console.error(`Could not send goodbye message in guild ${guild.id}:`, error.message));
}

module.exports = { DEFAULT_GOODBYE, DEFAULT_WELCOME, formatMessage, sendGoodbye, sendWelcome };
