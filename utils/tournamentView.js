const { EmbedBuilder } = require('discord.js');

const { getConfig } = require('./configStore');
const { getTournamentSummary } = require('./scoreStore');
const store = require('./tournamentStore');

const STATUS_LABELS = {
    draft: '📝 Draft',
    open: '🟢 Open for registration',
    live: '🔴 Live',
    closed: '⚫ Closed',
};

function regionChoices() {
    return store.REGIONS.map((region) => ({ name: `${region.label} (${region.value})`, value: region.value }));
}

async function announce(interaction, embed) {
    const config = await getConfig(interaction.guildId);
    if (!config.announcement_channel_id) return null;

    const channel = await interaction.guild.channels.fetch(config.announcement_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;

    return channel.send({ embeds: [embed] }).catch(() => null);
}

async function tournamentEmbed(guild, tournament) {
    const regions = await store.getRegions(tournament.id);
    const registrations = await store.countRegistrations(tournament.id);
    const summary = await getTournamentSummary(guild.id, tournament.id);

    const embed = new EmbedBuilder()
        .setColor(tournament.status === 'live' ? 0xed4245 : 0x5865f2)
        .setTitle(`🎮 ${tournament.name}`)
        .addFields(
            { name: 'Status', value: STATUS_LABELS[tournament.status], inline: true },
            { name: 'Players registered', value: String(registrations), inline: true },
            { name: 'Tournament ID', value: `\`${tournament.id}\``, inline: true },
        )
        .setTimestamp();

    if (tournament.description) embed.setDescription(tournament.description);
    if (tournament.starts_at) {
        embed.addFields({
            name: 'Starts',
            value: `<t:${Math.floor(new Date(tournament.starts_at).getTime() / 1000)}:F>`,
        });
    }

    embed.addFields({
        name: 'Regions & creator codes',
        value: regions.length
            ? regions
                  .map((region) => {
                      const code = region.creator_code ? `\`${region.creator_code}\`` : '_code not posted yet_';
                      const note = region.lobby_note ? `\n_${region.lobby_note}_` : '';
                      return `**${region.region}** — ${code}${note}`;
                  })
                  .join('\n')
            : '_no regions configured_',
    });

    if (summary.submissions > 0) {
        embed.addFields({
            name: 'Results so far',
            value: `${summary.wins} win${summary.wins === 1 ? '' : 's'} · ${summary.kills} kill${summary.kills === 1 ? '' : 's'} · ${summary.pending} awaiting review`,
        });
    }

    return embed;
}

module.exports = { STATUS_LABELS, announce, regionChoices, tournamentEmbed };
