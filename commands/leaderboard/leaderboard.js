const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { getConfig } = require('../../utils/configStore');
const { buildPlayerEmbed, buildTeamEmbed, setLiveBoard } = require('../../utils/leaderboards');

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
        )
        .addSubcommand((sub) =>
            sub
                .setName('post')
                .setDescription('Post self-updating boards. Administrators only.')
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

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const tournamentId = interaction.options.getInteger('tournament-id');

        if (subcommand === 'teams') {
            await interaction.reply({ embeds: [await buildTeamEmbed(interaction.guild, tournamentId)] });
            return;
        }

        if (subcommand === 'players') {
            await interaction.reply({ embeds: [await buildPlayerEmbed(interaction.guild, tournamentId)] });
            return;
        }

        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Only a server administrator can post the live boards.', ephemeral: true });
            return;
        }

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
    },
};
