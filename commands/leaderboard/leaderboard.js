const { SlashCommandBuilder } = require('discord.js');

const { buildPlayerEmbed, buildTeamEmbed } = require('../../utils/leaderboards');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the team and player standings.')
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('teams')
                .setDescription('View the team standings.')
                .addIntegerOption((option) =>
                    option.setName('tournament-id').setDescription('Limit to one tournament.').setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('players')
                .setDescription('View the player standings.')
                .addIntegerOption((option) =>
                    option.setName('tournament-id').setDescription('Limit to one tournament.').setMinValue(1),
                ),
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const tournamentId = interaction.options.getInteger('tournament-id');

        const embed =
            subcommand === 'teams'
                ? await buildTeamEmbed(interaction.guild, tournamentId)
                : await buildPlayerEmbed(interaction.guild, tournamentId);

        await interaction.reply({ embeds: [embed] });
    },
};
