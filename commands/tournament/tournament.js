const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const { STATUS_LABELS, regionChoices, tournamentEmbed } = require('../../utils/tournamentView');
const store = require('../../utils/tournamentStore');
const teamStore = require('../../utils/teamStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tournament')
        .setDescription('Register for tournaments and view them.')
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('join')
                .setDescription('Register for a tournament.')
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
                .setDescription('View the current tournament, its regions and creator codes.')
                .addIntegerOption((option) =>
                    option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
                ),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('View recent tournaments.')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

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

        const requestedId = interaction.options.getInteger('tournament-id');
        const tournament = requestedId
            ? await store.getTournament(interaction.guildId, requestedId)
            : await store.getActiveTournament(interaction.guildId);

        if (!tournament) {
            await interaction.reply({
                content: requestedId ? 'That tournament was not found.' : 'There is no active tournament right now.',
                ephemeral: true,
            });
            return;
        }

        // A draft is still being prepared, so it stays hidden from members.
        if (tournament.status === 'draft') {
            await interaction.reply({
                content: 'That tournament is not open yet. Watch the announcements channel.',
                ephemeral: true,
            });
            return;
        }

        if (subcommand === 'info') {
            await interaction.reply({ embeds: [await tournamentEmbed(interaction.guild, tournament)] });
            return;
        }

        // join
        if (tournament.status === 'closed') {
            await interaction.reply({ content: 'Registration for this tournament is not open.', ephemeral: true });
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
    },
};
