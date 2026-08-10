const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { getConfig } = require('../../utils/configStore');
const { getTournamentSummary } = require('../../utils/scoreStore');
const store = require('../../utils/tournamentStore');
const teamStore = require('../../utils/teamStore');

const STATUS_LABELS = {
    draft: '📝 Draft',
    open: '🟢 Open for registration',
    live: '🔴 Live',
    closed: '⚫ Closed',
};

function isAdmin(interaction) {
    return interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tournament')
        .setDescription('Create, join and manage tournaments.')
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('create')
                .setDescription('Create a tournament. Administrators only.')
                .addStringOption((option) =>
                    option.setName('name').setDescription('Tournament name.').setRequired(true).setMaxLength(100),
                )
                .addStringOption((option) =>
                    option
                        .setName('regions')
                        .setDescription('Regions, comma separated. For example: EU, NAE, NAW')
                        .setRequired(true)
                        .setMaxLength(100),
                )
                .addStringOption((option) =>
                    option.setName('description').setDescription('Optional details.').setMaxLength(1000),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('join')
                .setDescription('Register for a tournament with your Epic name and region.')
                .addStringOption((option) =>
                    option
                        .setName('epic-name')
                        .setDescription('Your exact Epic Games display name.')
                        .setRequired(true)
                        .setMaxLength(64),
                )
                .addStringOption((option) =>
                    option
                        .setName('region')
                        .setDescription('The region you will play in.')
                        .setRequired(true)
                        .addChoices(...regionChoices()),
                )
                .addIntegerOption((option) =>
                    option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('info')
                .setDescription('View a tournament, its regions and creator codes.')
                .addIntegerOption((option) =>
                    option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
                ),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('View recent tournaments.'))
        .addSubcommand((sub) =>
            sub
                .setName('code')
                .setDescription('Post the creator code for a region. Administrators only.')
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
                .setDescription('Change a tournament status. Administrators only.')
                .addStringOption((option) =>
                    option
                        .setName('status')
                        .setDescription('The new status.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Open for registration', value: 'open' },
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
                .setDescription('View who registered. Administrators only.')
                .addStringOption((option) =>
                    option.setName('region').setDescription('Filter by region.').addChoices(...regionChoices()),
                )
                .addIntegerOption((option) =>
                    option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
                ),
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const adminOnly = ['create', 'code', 'status', 'players'];

        if (adminOnly.includes(subcommand) && !isAdmin(interaction)) {
            await interaction.reply({ content: 'Only a server administrator can use this command.', ephemeral: true });
            return;
        }

        if (subcommand === 'create') {
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
                `Created **${name}** (ID \`${tournament.id}\`) for ${regions.join(', ')}.\n\nUse \`/tournament status status:Open\` to let players register, then \`/tournament code\` to post each creator code.`,
            );
            return;
        }

        const requestedId = interaction.options.getInteger('tournament-id');
        const tournament = requestedId
            ? await store.getTournament(interaction.guildId, requestedId)
            : await store.getActiveTournament(interaction.guildId);

        if (subcommand === 'list') {
            const tournaments = await store.listTournaments(interaction.guildId);
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🎮 Tournaments')
                .setDescription(
                    tournaments.length
                        ? tournaments
                              .map(
                                  (entry) =>
                                      `\`${entry.id}\` **${entry.name}** — ${STATUS_LABELS[entry.status]} · <t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:d>`,
                              )
                              .join('\n')
                        : 'No tournaments have been created yet.',
                );
            await interaction.reply({ embeds: [embed] });
            return;
        }

        if (!tournament) {
            await interaction.reply({
                content: requestedId
                    ? 'That tournament was not found.'
                    : 'There is no active tournament right now.',
                ephemeral: true,
            });
            return;
        }

        if (subcommand === 'info') {
            await interaction.reply({ embeds: [await tournamentEmbed(interaction.guild, tournament)] });
            return;
        }

        if (subcommand === 'join') {
            if (tournament.status === 'closed' || tournament.status === 'draft') {
                await interaction.reply({
                    content: 'Registration for this tournament is not open.',
                    ephemeral: true,
                });
                return;
            }

            const region = interaction.options.getString('region');
            const regions = await store.getRegions(tournament.id);

            if (!regions.some((entry) => entry.region === region)) {
                await interaction.reply({
                    content: `This tournament only runs in: ${regions.map((entry) => entry.region).join(', ')}`,
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const membership = await teamStore.getMembership(interaction.guildId, interaction.user.id);
            if (!membership) {
                await interaction.editReply('Join a team first before registering for a tournament.');
                return;
            }

            await store.register({
                tournamentId: tournament.id,
                guildId: interaction.guildId,
                userId: interaction.user.id,
                epicName: interaction.options.getString('epic-name').trim(),
                region,
                teamId: membership.team_id,
            });

            const regionRow = regions.find((entry) => entry.region === region);
            const codeLine = regionRow?.creator_code
                ? `The ${region} creator code is \`${regionRow.creator_code}\`.`
                : `The ${region} creator code has not been posted yet — watch the announcements channel.`;

            await interaction.editReply(
                `You are registered for **${tournament.name}** in **${region}** for <@&${membership.role_id}>.\n\n${codeLine}\n\nAfter your match, upload your end screen with \`/submit\`.`,
            );
            return;
        }

        if (subcommand === 'code') {
            const region = interaction.options.getString('region');
            const code = interaction.options.getString('code').trim();
            const note = interaction.options.getString('note');

            const regions = await store.getRegions(tournament.id);
            if (!regions.some((entry) => entry.region === region)) {
                await interaction.reply({
                    content: `This tournament does not run in ${region}.`,
                    ephemeral: true,
                });
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
            return;
        }

        if (subcommand === 'status') {
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
            return;
        }

        // players
        const region = interaction.options.getString('region');
        const registrations = await store.getRegistrations(tournament.id, region);

        const lines = registrations.map(
            (entry) => `• <@${entry.user_id}> — \`${entry.epic_name}\` · ${entry.region}`,
        );

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
    },
};
