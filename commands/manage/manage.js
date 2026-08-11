const { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { getConfig } = require('../../utils/configStore');
const { buildPlayerEmbed, buildTeamEmbed, setLiveBoard } = require('../../utils/leaderboards');
const { panelPayload, refreshPanel } = require('../../utils/teamPanel');
const { STATUS_LABELS, announce, regionChoices, tournamentEmbed } = require('../../utils/tournamentView');
const store = require('../../utils/tournamentStore');
const teamStore = require('../../utils/teamStore');

async function resolveTournament(interaction) {
    const requestedId = interaction.options.getInteger('tournament-id');
    const tournament = requestedId
        ? await store.getTournament(interaction.guildId, requestedId)
        : await store.getActiveTournament(interaction.guildId);

    if (!tournament) {
        await interaction.reply({
            content: requestedId ? 'That tournament was not found.' : 'There is no active tournament right now.',
            ephemeral: true,
        });
        return null;
    }

    return tournament;
}

async function tournamentCreate(interaction) {
    const name = interaction.options.getString('name');
    const regions = [
        ...new Set(
            interaction.options
                .getString('regions')
                .split(',')
                .map((region) => region.trim().toUpperCase())
                .filter((region) => store.REGION_VALUES.has(region)),
        ),
    ];

    if (!regions.length) {
        await interaction.reply({
            content: `Use one or more of these regions: ${[...store.REGION_VALUES].join(', ')}`,
            ephemeral: true,
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    const tournament = await store.createTournament({
        guildId: interaction.guildId,
        name,
        description: interaction.options.getString('description'),
        createdBy: interaction.user.id,
        regions,
    });

    await interaction.editReply(
        `Created **${name}** (ID \`${tournament.id}\`) for ${regions.join(', ')}.\n\nUse \`/manage tournament status status:Open\` to let players register, then \`/manage tournament code\` to post each creator code.`,
    );
}

async function tournamentCode(interaction, tournament) {
    const region = interaction.options.getString('region');
    const code = interaction.options.getString('code').trim();
    const note = interaction.options.getString('note');

    const regions = await store.getRegions(tournament.id);
    if (!regions.some((entry) => entry.region === region)) {
        await interaction.reply({ content: `This tournament does not run in ${region}.`, ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });
    await store.setCreatorCode(tournament.id, region, code, note);

    const registrations = await store.getRegistrations(tournament.id, region);
    const mentions = registrations.map((entry) => `<@${entry.user_id}>`).join(' ');

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`🔑 ${tournament.name} — ${region} lobby is open`)
        .setDescription(
            [
                `Enter creator code **\`${code}\`** in Fortnite to join the custom lobby.`,
                note ? `\n${note}` : '',
                '\nAfter the match, upload your end screen with `/submit`.',
            ].join(''),
        )
        .setTimestamp();

    const posted = await announce(interaction, embed);
    if (posted && mentions) {
        await posted.reply({ content: mentions.slice(0, 1900), allowedMentions: { parse: ['users'] } }).catch(() => {});
    }

    await interaction.editReply(
        posted
            ? `The ${region} creator code has been posted and ${registrations.length} registered player(s) were notified.`
            : `The ${region} creator code is saved. Set an announcement channel in \`/setup\` to post it automatically.`,
    );
}

async function tournamentStatus(interaction, tournament) {
    const status = interaction.options.getString('status');
    await interaction.deferReply({ ephemeral: true });
    await store.setTournamentStatus(interaction.guildId, tournament.id, status);

    if (status === 'open') {
        await announce(
            interaction,
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle(`🎮 ${tournament.name} — registration is open`)
                .setDescription(
                    [
                        tournament.description || '',
                        '',
                        'Register with `/tournament join` using your exact Epic name and your region.',
                    ].join('\n'),
                )
                .setTimestamp(),
        );
    }

    await interaction.editReply(`**${tournament.name}** is now ${STATUS_LABELS[status]}.`);
}

async function tournamentPlayers(interaction, tournament) {
    const region = interaction.options.getString('region');
    const registrations = await store.getRegistrations(tournament.id, region);

    const lines = registrations.map((entry) => `• <@${entry.user_id}> — \`${entry.epic_name}\` · ${entry.region}`);
    const description = lines.join('\n') || 'Nobody has registered yet.';

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`${tournament.name} — registered players${region ? ` (${region})` : ''}`)
                .setDescription(description.length > 4096 ? `${description.slice(0, 4075)}\n\n…more` : description)
                .setFooter({ text: `${registrations.length} player(s)` }),
        ],
        ephemeral: true,
    });
}

async function teamPanel(interaction) {
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
}

async function teamAssign(interaction) {
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
}

async function teamReset(interaction) {
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
}

async function leaderboardPost(interaction) {
    const tournamentId = interaction.options.getInteger('tournament-id');
    const config = await getConfig(interaction.guildId);
    const channel =
        interaction.options.getChannel('channel') ||
        (config.leaderboard_channel_id
            ? await interaction.guild.channels.fetch(config.leaderboard_channel_id).catch(() => null)
            : interaction.channel);

    if (!channel || !channel.isTextBased()) {
        await interaction.reply({ content: 'Choose a valid text channel.', ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    const teamMessage = await channel.send({ embeds: [await buildTeamEmbed(interaction.guild, tournamentId)] });
    await setLiveBoard(interaction.guildId, 'team', channel.id, teamMessage.id, tournamentId);

    const playerMessage = await channel.send({ embeds: [await buildPlayerEmbed(interaction.guild, tournamentId)] });
    await setLiveBoard(interaction.guildId, 'player', channel.id, playerMessage.id, tournamentId);

    await interaction.editReply(
        `The team and player boards have been posted in ${channel}. They refresh every minute and after every review.`,
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage')
        .setDescription('Administrator tools for tournaments, teams and boards.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommandGroup((group) =>
            group
                .setName('tournament')
                .setDescription('Create and run tournaments.')
                .addSubcommand((sub) =>
                    sub
                        .setName('create')
                        .setDescription('Create a tournament.')
                        .addStringOption((option) =>
                            option.setName('name').setDescription('Tournament name.').setRequired(true).setMaxLength(100),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('regions')
                                .setDescription('Comma-separated regions, for example: EU, NAE, NAW')
                                .setRequired(true)
                                .setMaxLength(100),
                        )
                        .addStringOption((option) =>
                            option.setName('description').setDescription('Optional details.').setMaxLength(1000),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('code')
                        .setDescription('Post the creator code for a region.')
                        .addStringOption((option) =>
                            option.setName('region').setDescription('The region.').setRequired(true).addChoices(...regionChoices()),
                        )
                        .addStringOption((option) =>
                            option.setName('code').setDescription('The Fortnite creator code.').setRequired(true).setMaxLength(32),
                        )
                        .addIntegerOption((option) =>
                            option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
                        )
                        .addStringOption((option) =>
                            option.setName('note').setDescription('Optional lobby instructions.').setMaxLength(200),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('status')
                        .setDescription('Change a tournament status.')
                        .addStringOption((option) =>
                            option
                                .setName('status')
                                .setDescription('The new status.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Draft', value: 'draft' },
                                    { name: 'Open', value: 'open' },
                                    { name: 'Live', value: 'live' },
                                    { name: 'Closed', value: 'closed' },
                                ),
                        )
                        .addIntegerOption((option) =>
                            option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('players')
                        .setDescription('View who is registered, with their Epic names.')
                        .addStringOption((option) =>
                            option.setName('region').setDescription('Filter by region.').addChoices(...regionChoices()),
                        )
                        .addIntegerOption((option) =>
                            option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('info')
                        .setDescription('View a tournament, including any draft.')
                        .addIntegerOption((option) =>
                            option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
                        ),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('team')
                .setDescription('Manage teams and their members.')
                .addSubcommand((sub) =>
                    sub
                        .setName('panel')
                        .setDescription('Post the team join panel.')
                        .addChannelOption((option) =>
                            option
                                .setName('channel')
                                .setDescription('Channel for the panel; defaults to the configured one.')
                                .addChannelTypes(ChannelType.GuildText),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('assign')
                        .setDescription('Move a member to a team.')
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
                        .setDescription('Remove a member from their team so they can choose again.')
                        .addUserOption((option) =>
                            option.setName('member').setDescription('The member to reset.').setRequired(true),
                        ),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('leaderboard')
                .setDescription('Manage the live boards.')
                .addSubcommand((sub) =>
                    sub
                        .setName('post')
                        .setDescription('Post self-updating team and player boards.')
                        .addChannelOption((option) =>
                            option
                                .setName('channel')
                                .setDescription('Channel for the boards; defaults to the configured leaderboard channel.')
                                .addChannelTypes(ChannelType.GuildText),
                        )
                        .addIntegerOption((option) =>
                            option.setName('tournament-id').setDescription('Limit the boards to one tournament.').setMinValue(1),
                        ),
                ),
        ),

    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        if (group === 'tournament') {
            if (subcommand === 'create') {
                await tournamentCreate(interaction);
                return;
            }

            const tournament = await resolveTournament(interaction);
            if (!tournament) return;

            if (subcommand === 'code') await tournamentCode(interaction, tournament);
            else if (subcommand === 'status') await tournamentStatus(interaction, tournament);
            else if (subcommand === 'players') await tournamentPlayers(interaction, tournament);
            else if (subcommand === 'info') {
                await interaction.reply({
                    embeds: [await tournamentEmbed(interaction.guild, tournament)],
                    ephemeral: true,
                });
            }
            return;
        }

        if (group === 'team') {
            if (subcommand === 'panel') await teamPanel(interaction);
            else if (subcommand === 'assign') await teamAssign(interaction);
            else if (subcommand === 'reset') await teamReset(interaction);
            return;
        }

        if (group === 'leaderboard' && subcommand === 'post') {
            await leaderboardPost(interaction);
        }
    },
};
