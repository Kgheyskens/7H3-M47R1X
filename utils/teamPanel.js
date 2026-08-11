const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const { getTeamStandings } = require('./scoreStore');
const teamStore = require('./teamStore');

function chunk(items, size) {
    const rows = [];
    for (let index = 0; index < items.length; index += size) {
        rows.push(items.slice(index, index + size));
    }
    return rows;
}

async function panelPayload(guild) {
    const teams = await teamStore.getTeams(guild.id);
    const standings = await getTeamStandings(guild.id);
    const pointsByTeam = new Map(standings.map((row) => [String(row.team_id), row]));

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('👥 Choose your team')
        .setDescription(
            teams.length
                ? 'Click a button to join a team. Your tournament points count towards that team.'
                : 'No teams have been configured yet.',
        );

    if (teams.length) {
        embed.addFields({
            name: 'Teams',
            value: teams
                .map((team) => {
                    const row = pointsByTeam.get(String(team.id));
                    const players = row?.players ?? 0;
                    const points = row?.points ?? 0;
                    return `<@&${team.role_id}> — **${points}** point${points === 1 ? '' : 's'} · ${players} player${players === 1 ? '' : 's'}`;
                })
                .join('\n'),
        });
    }

    // The button stays on the `team` command so its customId keeps routing there.
    const buttons = teams.map((team) =>
        new ButtonBuilder()
            .setCustomId(`team:join:${team.id}`)
            .setLabel(team.name.slice(0, 80))
            .setStyle(ButtonStyle.Primary),
    );

    return { embeds: [embed], components: chunk(buttons, 5).map((row) => new ActionRowBuilder().addComponents(row)) };
}

async function refreshPanel(guild) {
    const panel = await teamStore.getTeamPanel(guild.id);
    if (!panel) return;

    const channel = await guild.channels.fetch(panel.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(panel.message_id).catch(() => null);
    if (!message) return;

    await message.edit(await panelPayload(guild));
}

module.exports = { panelPayload, refreshPanel };
