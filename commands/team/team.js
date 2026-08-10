const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');

const { getConfig } = require('../../utils/configStore');
const { getTeamStandings } = require('../../utils/scoreStore');
const teamStore = require('../../utils/teamStore');

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
        .setDescription('View and manage teams.')
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('list').setDescription('View every team and its score.'))
        .addSubcommand((sub) =>
            sub
                .setName('status')
                .setDescription('View which team a member is on.')
                .addUserOption((option) => option.setName('member').setDescription('The member to look up.')),
        )
        .addSubcommand((sub) =>
            sub
                .setName('panel')
                .setDescription('Post the team join panel. Administrators only.')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Channel for the panel; defaults to the configured team channel.')
                        .addChannelTypes(ChannelType.GuildText),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('assign')
                .setDescription('Move a member to a team. Administrators only.')
                .addUserOption((option) =>
                    option.setName('member').setDescription('The member to move.').setRequired(true),
                )
                .addRoleOption((option) =>
                    option.setName('team').setDescription('The team role.').setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('reset')
                .setDescription('Remove a member from their team. Administrators only.')
                .addUserOption((option) =>
                    option.setName('member').setDescription('The member to reset.').setRequired(true),
                ),
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

        if (subcommand === 'status') {
            const user = interaction.options.getUser('member') || interaction.user;
            const membership = await teamStore.getMembership(interaction.guildId, user.id);
            await interaction.reply({
                content: membership ? `${user} is on <@&${membership.role_id}>.` : `${user} has not joined a team yet.`,
                allowedMentions: { parse: [] },
            });
            return;
        }

        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Only a server administrator can use this command.', ephemeral: true });
            return;
        }

        if (subcommand === 'panel') {
            const config = await getConfig(interaction.guildId);
            const channel =
                interaction.options.getChannel('channel') ||
                (config.team_panel_channel_id
                    ? await interaction.guild.channels.fetch(config.team_panel_channel_id).catch(() => null)
                    : interaction.channel);

            if (!channel || !channel.isTextBased()) {
                await interaction.reply({ content: 'Choose a valid text channel.', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            const message = await channel.send(await panelPayload(interaction.guild));
            await teamStore.setTeamPanel(interaction.guildId, channel.id, message.id);
            await interaction.editReply(`The team panel has been posted in ${channel}.`);
            return;
        }

        if (subcommand === 'assign') {
            const user = interaction.options.getUser('member');
            const role = interaction.options.getRole('team');
            const teams = await teamStore.getTeams(interaction.guildId);
            const team = teams.find((entry) => entry.role_id === role.id);

            if (!team) {
                await interaction.reply({ content: `${role} is not a configured team.`, ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            const existing = await teamStore.getMembership(interaction.guildId, user.id);

            if (member && existing) await member.roles.remove(existing.role_id).catch(() => {});
            await teamStore.switchTeam(interaction.guildId, user.id, team.id);
            if (member) await member.roles.add(role.id, `Assigned by ${interaction.user.tag}`).catch(() => {});

            await interaction.editReply(`${user} is now on ${role}.`);
            await refreshPanel(interaction.guild).catch(() => {});
            return;
        }

        // reset
        const user = interaction.options.getUser('member');
        await interaction.deferReply({ ephemeral: true });

        const removed = await teamStore.leaveTeam(interaction.guildId, user.id);
        if (!removed) {
            await interaction.editReply(`${user} is not on a team.`);
            return;
        }

        const team = await teamStore.getTeam(interaction.guildId, removed.team_id);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member && team) await member.roles.remove(team.role_id).catch(() => {});

        await interaction.editReply(`${user} has been removed from their team and can choose again.`);
        await refreshPanel(interaction.guild).catch(() => {});
    },

    async handleButton(interaction) {
        const [, action, teamId] = interaction.customId.split(':');
        if (action !== 'join' || !/^[0-9]+$/.test(teamId)) return;
        await handleJoin(interaction, teamId);
    },

    panelPayload,
    refreshPanel,
};
