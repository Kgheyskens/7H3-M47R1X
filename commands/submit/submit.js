const crypto = require('node:crypto');
const axios = require('axios');
const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { getConfig } = require('../../utils/configStore');
const { manualReview, toDetection, verifyScreenshot } = require('../../utils/aiVerifier');
const { refreshGuildBoards } = require('../../utils/leaderboards');
const submissionStore = require('../../utils/submissionStore');
const teamStore = require('../../utils/teamStore');
const tournamentStore = require('../../utils/tournamentStore');

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

const AI_STATUS_LABELS = {
    not_submitted: 'no screenshot',
    verified: 'win detected',
    rejected: 'no win detected',
    manual_review: 'needs a closer look',
    unavailable: 'verifier unavailable',
};

function submissionEmbed(submission) {
    const embed = new EmbedBuilder()
        .setColor(submission.status === 'approved' ? 0x57f287 : 0xfee75c)
        .setTitle(`Submission #${submission.id}`)
        .setTimestamp(new Date(submission.created_at))
        .addFields(
            { name: 'Status', value: submission.status, inline: true },
            { name: 'Kills submitted', value: String(submission.submitted_kills), inline: true },
            { name: 'Win claimed', value: submission.claimed_victory ? 'Yes' : 'No', inline: true },
            { name: 'AI verdict', value: AI_STATUS_LABELS[submission.ai_status] || submission.ai_status, inline: true },
            {
                name: 'AI confidence',
                value: submission.ai_confidence === null ? 'n/a' : `${Math.round(submission.ai_confidence * 100)}%`,
                inline: true,
            },
            { name: 'AI read kills', value: submission.ai_predicted_kills === null ? 'n/a' : String(submission.ai_predicted_kills), inline: true },
        );

    if (submission.ai_note) embed.addFields({ name: 'AI note', value: submission.ai_note.slice(0, 1024) });
    if (submission.ai_predicted_epic_name) {
        embed.addFields({ name: 'Epic name read', value: submission.ai_predicted_epic_name, inline: true });
    }

    return embed;
}

async function downloadScreenshot(attachment) {
    if (!ALLOWED_MIME.has(attachment.contentType) || attachment.size > MAX_BYTES) {
        throw new Error('Upload a PNG, JPEG, or WebP image no larger than 8 MB.');
    }

    const response = await axios.get(attachment.url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
    });

    return Buffer.from(response.data);
}

async function runVerifier(config, buffer, mime) {
    if (!config.ai_enabled) return manualReview('AI verification is turned off for this server.');

    try {
        return toDetection(await verifyScreenshot({ imageBuffer: buffer, mime }));
    } catch (error) {
        console.error('Screenshot verification failed:', error.message);
        return manualReview('Automatic verification failed; staff review is required.');
    }
}

async function notifyStaff(interaction, submission, targetUserId) {
    const config = await getConfig(interaction.guildId);
    if (!config.submission_channel_id) return;

    const channel = await interaction.guild.channels.fetch(config.submission_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = submissionEmbed(submission).setAuthor({ name: `Submitted for a player` });
    embed.setDescription(`<@${targetUserId}> · needs review`);

    const dashboardUrl = process.env.DASHBOARD_URL || process.env.RENDER_EXTERNAL_URL;
    if (dashboardUrl) {
        embed.addFields({
            name: 'Review',
            value: `[Open the dashboard](${dashboardUrl.replace(/\/+$/, '')}/admin)`,
        });
    }

    await channel
        .send({ embeds: [embed], allowedMentions: { parse: [] } })
        .catch((error) => console.error('Could not post the submission notice:', error.message));
}

/**
 * Shared by /submit and /admin-submit. `targetUser` is who the result belongs to;
 * `interaction.user` is who uploaded it.
 */
async function createSubmission(interaction, { targetUser, kills, victory, attachment, note }) {
    const config = await getConfig(interaction.guildId);
    const tournamentId = interaction.options.getInteger('tournament-id');
    const tournament = tournamentId
        ? await tournamentStore.getTournament(interaction.guildId, tournamentId)
        : await tournamentStore.getActiveTournament(interaction.guildId);

    if (!tournament) {
        await interaction.editReply('There is no active tournament to submit to.');
        return;
    }

    if (tournament.status === 'closed') {
        await interaction.editReply(`**${tournament.name}** is closed and no longer accepts results.`);
        return;
    }

    const registration = await tournamentStore.getRegistration(tournament.id, targetUser.id);
    if (!registration) {
        await interaction.editReply(
            targetUser.id === interaction.user.id
                ? `Register for **${tournament.name}** with \`/tournament join\` first.`
                : `${targetUser} is not registered for **${tournament.name}**.`,
        );
        return;
    }

    if (victory && !attachment) {
        await interaction.editReply('A win submission needs a screenshot of the Victory Royale screen.');
        return;
    }

    let buffer = null;
    let hash = null;
    let detection = { status: 'not_submitted', confidence: null, note: null, predictedKills: null, predictedVictory: null, predictedEpicName: null };

    if (attachment) {
        try {
            buffer = await downloadScreenshot(attachment);
        } catch (error) {
            await interaction.editReply(error.message);
            return;
        }

        hash = crypto.createHash('sha256').update(buffer).digest('hex');
        detection = await runVerifier(config, buffer, attachment.contentType);
    }

    let submission;
    try {
        submission = await submissionStore.createSubmission({
            guildId: interaction.guildId,
            tournamentId: tournament.id,
            userId: targetUser.id,
            teamId: registration.team_id,
            region: registration.region,
            epicName: registration.epic_name,
            submittedBy: interaction.user.id,
            kills,
            claimedVictory: victory,
            screenshotHash: hash,
            screenshotData: buffer,
            screenshotMime: attachment?.contentType ?? null,
            screenshotUrl: attachment?.url ?? null,
            aiStatus: detection.status,
            aiConfidence: detection.confidence,
            aiNote: note ? `${note}${detection.note ? ` — ${detection.note}` : ''}` : detection.note,
            aiPredictedKills: detection.predictedKills,
            aiPredictedVictory: detection.predictedVictory,
            aiPredictedEpicName: detection.predictedEpicName,
        });
    } catch (error) {
        if (error.code === '23505') {
            await interaction.editReply('This screenshot has already been submitted.');
            return;
        }
        console.error('Submission error:', error);
        await interaction.editReply('The submission could not be stored. Try again in a moment.');
        return;
    }

    const nameMismatch =
        detection.predictedEpicName &&
        detection.predictedEpicName.toLowerCase() !== registration.epic_name.toLowerCase();

    const lines = ['Submission received. Points are added once staff approve it.'];
    if (detection.status === 'rejected') {
        lines.push('The screenshot did not clearly show a Victory Royale, so staff will review it manually.');
    }
    if (nameMismatch) {
        lines.push(
            `The name read from the screenshot (\`${detection.predictedEpicName}\`) does not match your registered Epic name (\`${registration.epic_name}\`). Staff will check this.`,
        );
    }

    await interaction.editReply({ content: lines.join('\n'), embeds: [submissionEmbed(submission)] });
    await notifyStaff(interaction, submission, targetUser.id).catch(() => {});
    await refreshGuildBoards(interaction.guild).catch(() => {});
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('submit')
        .setDescription('Submit your Fortnite match result.')
        .setDMPermission(false)
        .addIntegerOption((option) =>
            option
                .setName('kills')
                .setDescription('Your eliminations in this match.')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100),
        )
        .addBooleanOption((option) =>
            option.setName('win').setDescription('Did you win the match?').setRequired(true),
        )
        .addAttachmentOption((option) =>
            option
                .setName('screenshot')
                .setDescription('Your end-of-match screen. Required for a win; mobile photos work too.'),
        )
        .addIntegerOption((option) =>
            option.setName('tournament-id').setDescription('Defaults to the active tournament.').setMinValue(1),
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const config = await getConfig(interaction.guildId);
        if (!config.player_submissions_enabled) {
            await interaction.editReply('Players cannot submit results on this server. Ask a staff member to submit for you.');
            return;
        }

        const membership = await teamStore.getMembership(interaction.guildId, interaction.user.id);
        if (!membership) {
            await interaction.editReply('Join a team before submitting a result.');
            return;
        }

        await createSubmission(interaction, {
            targetUser: interaction.user,
            kills: interaction.options.getInteger('kills'),
            victory: interaction.options.getBoolean('win'),
            attachment: interaction.options.getAttachment('screenshot'),
            note: null,
        });
    },

    createSubmission,
    submissionEmbed,
    isStaff(interaction, config) {
        if (interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return true;
        return Boolean(config.staff_role_id && interaction.member.roles.cache.has(config.staff_role_id));
    },
};
