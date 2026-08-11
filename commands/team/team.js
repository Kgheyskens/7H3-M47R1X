const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const { getConfig } = require('../../utils/configStore');
const { getTeamStandings } = require('../../utils/scoreStore');
const { refreshPanel } = require('../../utils/teamPanel');
const teamStore = require('../../utils/teamStore');

async function handleJoin(interaction, teamId) {
    await interaction.deferReply({ ephemeral: true });

    const config = await getConfig(interaction.guildId);
    const team = await teamStore.getTeam(interaction.guildId, teamId);

    if (!team) {
        await interaction.editReply('This team no longer exists.');
        return;
    }

    const role = await interaction.guild.roles.fetch(team.role_id).catch(() => null);
    if (!role) {
        await interaction.editReply('The role for this team no longer exists. Ask an administrator to run `/setup`.');
        return;
    }

    const existing = await teamStore.getMembership(interaction.guildId, interaction.user.id);

    if (existing && !config.team_switching_allowed) {
        // Re-add the role in case it was manually stripped.
        await interaction.member.roles.add(existing.role_id).catch(() => {});
        const message =
            String(existing.team_id) === String(teamId)
                ? `You are already on <@&${existing.role_id}>.`
                : `You are already on <@&${existing.role_id}>. Only an administrator can move you.`;
        await interaction.editReply(message);
        return;
    }

    if (existing && String(existing.team_id) === String(teamId)) {
        await interaction.member.roles.add(role).catch(() => {});
        await interaction.editReply(`You are already on ${role}.`);
        return;
    }

    if (existing) {
        await interaction.member.roles.remove(existing.role_id).catch(() => {});
        await teamStore.switchTeam(interaction.guildId, interaction.user.id, teamId);
    } else {
        const { created } = await teamStore.joinTeam(interaction.guildId, interaction.user.id, teamId);
        if (!created) {
            const current = await teamStore.getMembership(interaction.guildId, interaction.user.id);
            await interaction.editReply(`You are already on <@&${current.role_id}>.`);
            return;
        }
    }

    try {
        await interaction.member.roles.add(role, `Joined team ${team.name}`);
    } catch (error) {
        if (!existing) await teamStore.rollbackJoin(interaction.guildId, interaction.user.id, teamId);
        console.error('Could not assign a team role:', error.message);
        await interaction.editReply('I could not assign the role. Ask an administrator to move my role higher.');
        return;
    }

    await interaction.editReply(
        config.team_switching_allowed
            ? `You joined ${role}.`
            : `You joined ${role}. Only an administrator can move you to another team.`,
    );

    await refreshPanel(interaction.guild).catch(() => {});
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('team')
        .setDescription('View teams and your own membership.')
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('list').setDescription('View every team and its score.'))
        .addSubcommand((sub) =>
            sub
                .setName('status')
                .setDescription('See which team someone is on.')
                .addUserOption((option) => option.setName('member').setDescription('The member to look up.')),
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const standings = await getTeamStandings(interaction.guildId);
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('👥 Teams')
                .setDescription(
                    standings.length
                        ? standings
                              .map(
                                  (row) =>
                                      `<@&${row.role_id}> — **${row.points}** point${row.points === 1 ? '' : 's'} · ${row.wins} win${row.wins === 1 ? '' : 's'} · ${row.kills} kill${row.kills === 1 ? '' : 's'} · ${row.players} player${row.players === 1 ? '' : 's'}`,
                              )
                              .join('\n')
                        : 'No teams have been configured yet.',
                );
            await interaction.reply({ embeds: [embed] });
            return;
        }

        // status
        const user = interaction.options.getUser('member') || interaction.user;
        const membership = await teamStore.getMembership(interaction.guildId, user.id);
        await interaction.reply({
            content: membership ? `${user} is on <@&${membership.role_id}>.` : `${user} has not joined a team yet.`,
            allowedMentions: { parse: [] },
        });
    },

    async handleButton(interaction) {
        const [, action, teamId] = interaction.customId.split(':');
        if (action !== 'join' || !/^[0-9]+$/.test(teamId)) return;
        await handleJoin(interaction, teamId);
    },
};
