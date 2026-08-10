const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { getConfig } = require('../../utils/configStore');
const submitCommand = require('../submit/submit');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-submit')
        .setDescription('Submit a match result on behalf of a player.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addUserOption((option) =>
            option.setName('player').setDescription('The player this result belongs to.').setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName('kills')
                .setDescription('Eliminations in this match.')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100),
        )
        .addBooleanOption((option) =>
            option.setName('win').setDescription('Did they win the match?').setRequired(true),
        )
        .addAttachmentOption((option) =>
            option.setName('screenshot').setDescription('The end-of-match screen. Required for a win.'),
        )
        .addIntegerOption((option) =>
            option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
        )
        .addStringOption((option) =>
            option.setName('note').setDescription('Optional note for the review log.').setMaxLength(300),
        ),

    async execute(interaction) {
        const config = await getConfig(interaction.guildId);

        if (!submitCommand.isStaff(interaction, config)) {
            await interaction.reply({ content: 'Only staff can submit results for other players.', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        await submitCommand.createSubmission(interaction, {
            targetUser: interaction.options.getUser('player'),
            kills: interaction.options.getInteger('kills'),
            victory: interaction.options.getBoolean('win'),
            attachment: interaction.options.getAttachment('screenshot'),
            note: interaction.options.getString('note'),
        });
    },
};
