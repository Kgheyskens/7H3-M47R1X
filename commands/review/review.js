const { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { refreshGuildBoards } = require('../../utils/leaderboards');
const store = require('../../utils/submissionStore');
const teamStore = require('../../utils/teamStore');
const { submissionEmbed } = require('../submit/submit');

function confidenceText(value) {
    return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}

function dashboardLink() {
    const base = process.env.DASHBOARD_URL || process.env.RENDER_EXTERNAL_URL;
    return base ? `${base.replace(/\/+$/, '')}/admin` : null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('review')
        .setDescription('Review submitted match results.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('queue')
                .setDescription('List submissions waiting for review.')
                .addIntegerOption((option) =>
                    option.setName('limit').setDescription('How many to show.').setMinValue(1).setMaxValue(25),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('show')
                .setDescription('Inspect one submission and its screenshot.')
                .addIntegerOption((option) =>
                    option.setName('submission-id').setDescription('The submission ID.').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('approve')
                .setDescription('Approve a submission and award its points.')
                .addIntegerOption((option) =>
                    option.setName('submission-id').setDescription('The submission ID.').setRequired(true).setMinValue(1),
                )
                .addBooleanOption((option) =>
                    option.setName('win').setDescription('Award a Victory Royale for this match.').setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('kills')
                        .setDescription('Approved kills; defaults to the submitted count.')
                        .setMinValue(0)
                        .setMaxValue(100),
                )
                .addStringOption((option) =>
                    option.setName('note').setDescription('Optional moderation note.').setMaxLength(500),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('reject')
                .setDescription('Reject a submission without awarding points.')
                .addIntegerOption((option) =>
                    option.setName('submission-id').setDescription('The submission ID.').setRequired(true).setMinValue(1),
                )
                .addStringOption((option) =>
                    option.setName('reason').setDescription('Why it was rejected.').setRequired(true).setMaxLength(500),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Remove an approved submission and take back its points.')
                .addIntegerOption((option) =>
                    option.setName('submission-id').setDescription('The submission ID.').setRequired(true).setMinValue(1),
                )
                .addStringOption((option) =>
                    option.setName('reason').setDescription('Why it was removed.').setRequired(true).setMaxLength(500),
                ),
        )
        .addSubcommand((sub) => sub.setName('dashboard').setDescription('Get the link to the web dashboard.'))
        .addSubcommand((sub) =>
            sub
                .setName('logs')
                .setDescription('View recent moderation actions.')
                .addIntegerOption((option) =>
                    option.setName('limit').setDescription('How many to show.').setMinValue(1).setMaxValue(25),
                ),
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Only a server administrator can use this command.', ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'dashboard') {
            const link = dashboardLink();
            await interaction.reply({
                content: link
                    ? `Review submissions here: ${link}`
                    : 'Set `DASHBOARD_URL` to your public bot URL to use the web dashboard.',
                ephemeral: true,
            });
            return;
        }

        if (subcommand === 'queue') {
            const rows = await store.getPendingSubmissions(guildId, interaction.options.getInteger('limit') || 10);
            const description = rows.length
                ? rows
                      .map((row) =>
                          [
                              `**#${row.id}** · <@${row.user_id}> · ${row.region || 'no region'}`,
                              `Kills: ${row.submitted_kills} · Win claimed: ${row.claimed_victory ? 'Yes' : 'No'} · AI: ${row.ai_status} (${confidenceText(row.ai_confidence)})`,
                          ].join('\n'),
                      )
                      .join('\n\n')
                : 'There are no submissions waiting for review.';

            const embed = new EmbedBuilder()
                .setColor(0xfee75c)
                .setTitle('Pending submissions')
                .setDescription(description);

            const link = dashboardLink();
            if (link) embed.setFooter({ text: 'Approve with buttons and screenshots on the web dashboard.' });

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        if (subcommand === 'logs') {
            const logs = await store.getModerationLogs(guildId, interaction.options.getInteger('limit') || 10);
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x5865f2)
                        .setTitle('Moderation log')
                        .setDescription(
                            logs.length
                                ? logs
                                      .map(
                                          (log) =>
                                              `**${log.action}** submission #${log.submission_id ?? 'n/a'} by <@${log.actor_id}>\n<t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:R>`,
                                      )
                                      .join('\n\n')
                                : 'No moderation actions have been logged.',
                        ),
                ],
                ephemeral: true,
            });
            return;
        }

        const submissionId = interaction.options.getInteger('submission-id');
        const submission = await store.getSubmission(guildId, submissionId);

        if (!submission) {
            await interaction.reply({ content: 'Submission not found.', ephemeral: true });
            return;
        }

        if (subcommand === 'show') {
            await interaction.deferReply({ ephemeral: true });

            const embed = submissionEmbed(submission);
            embed.addFields(
                { name: 'Player', value: `<@${submission.user_id}>`, inline: true },
                { name: 'Region', value: submission.region || 'n/a', inline: true },
                { name: 'Epic name', value: submission.epic_name || 'n/a', inline: true },
            );

            const files = [];
            if (submission.screenshot_data) {
                const extension = submission.screenshot_mime === 'image/png' ? 'png' : 'jpg';
                files.push(new AttachmentBuilder(submission.screenshot_data, { name: `submission-${submission.id}.${extension}` }));
            }

            await interaction.editReply({ embeds: [embed], files });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            if (subcommand === 'approve') {
                const kills = interaction.options.getInteger('kills') ?? submission.submitted_kills;
                const victory = interaction.options.getBoolean('win');
                const membership = await teamStore.getMembership(guildId, submission.user_id);

                const updated = await store.approveSubmission(guildId, submissionId, interaction.user.id, {
                    kills,
                    victory,
                    note: interaction.options.getString('note'),
                    teamId: membership?.team_id ?? null,
                });

                if (!updated) {
                    await interaction.editReply('Submission not found or already removed.');
                    return;
                }

                await refreshGuildBoards(interaction.guild).catch(() => {});
                await interaction.editReply(`Submission #${submissionId} approved.`);
                return;
            }

            const reason = interaction.options.getString('reason');
            const action = subcommand === 'reject' ? store.rejectSubmission : store.removeSubmission;
            const updated = await action(guildId, submissionId, interaction.user.id, reason);

            if (!updated) {
                await interaction.editReply('Submission not found or already removed.');
                return;
            }

            await refreshGuildBoards(interaction.guild).catch(() => {});
            await interaction.editReply(`Submission #${submissionId} ${subcommand === 'reject' ? 'rejected' : 'removed'}.`);
        } catch (error) {
            if (error.code === '23505') {
                await interaction.editReply('This player already has an approved win for this tournament.');
                return;
            }
            console.error('Review error:', error);
            await interaction.editReply(error.message || 'The moderation action failed.');
        }
    },
};
