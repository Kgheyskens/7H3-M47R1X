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

/**
 * guild.memberCount counts bots and apps too, which makes "{membercount}" read wrong for a
 * welcome/goodbye message about the human community. The member cache is not guaranteed to
 * be complete just because the GuildMembers intent is enabled, so this fetches the full list
 * first — an extra API call, but this only runs once per join/leave, not on a hot path.
 */
async function humanMemberCount(guild) {
    const members = await guild.members.fetch().catch(() => guild.members.cache);
    return members.filter((member) => !member.user.bot).size;
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
        memberCount: await humanMemberCount(member.guild),
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
        memberCount: await humanMemberCount(guild),
    });

    await channel
        .send({ embeds: [new EmbedBuilder().setColor(0x2f3136).setDescription(text)] })
        .catch((error) => console.error(`Could not send goodbye message in guild ${guild.id}:`, error.message));
}

module.exports = { DEFAULT_GOODBYE, DEFAULT_WELCOME, formatMessage, sendGoodbye, sendWelcome };
