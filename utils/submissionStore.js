const { query, withTransaction } = require('./db');

const AI_ACTOR = 'ai-auto';

async function addLog(client, guildId, submissionId, actorId, action, details = {}) {
    await client.query(
        'INSERT INTO moderation_logs (guild_id, submission_id, actor_id, action, details) VALUES ($1, $2, $3, $4, $5)',
        [guildId, submissionId, actorId, action, JSON.stringify(details)],
    );
}

async function createSubmission(input) {
    return withTransaction(async (client) => {
        const result = await client.query(
            `INSERT INTO submissions (
                guild_id, tournament_id, user_id, team_id, region, epic_name, submitted_by,
                submitted_kills, claimed_victory,
                screenshot_hash, screenshot_data, screenshot_mime, screenshot_url,
                ai_status, ai_confidence, ai_note,
                ai_predicted_kills, ai_predicted_victory, ai_predicted_epic_name
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            RETURNING *`,
            [
                input.guildId,
                input.tournamentId ?? null,
                input.userId,
                input.teamId ?? null,
                input.region ?? null,
                input.epicName ?? null,
                input.submittedBy,
                input.kills,
                Boolean(input.claimedVictory),
                input.screenshotHash ?? null,
                input.screenshotData ?? null,
                input.screenshotMime ?? null,
                input.screenshotUrl ?? null,
                input.aiStatus ?? 'not_submitted',
                input.aiConfidence ?? null,
                input.aiNote ?? null,
                input.aiPredictedKills ?? null,
                input.aiPredictedVictory ?? null,
                input.aiPredictedEpicName ?? null,
            ],
        );

        const submission = result.rows[0];
        await addLog(client, input.guildId, submission.id, input.submittedBy, 'submitted', {
            kills: input.kills,
            claimedVictory: Boolean(input.claimedVictory),
            aiStatus: input.aiStatus ?? 'not_submitted',
        });

        return submission;
    });
}

async function getSubmission(guildId, submissionId) {
    const result = await query('SELECT * FROM submissions WHERE guild_id = $1 AND id = $2', [guildId, submissionId]);
    return result.rows[0] || null;
}

async function getLatestSubmission(guildId, userId) {
    const result = await query(
        'SELECT * FROM submissions WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1',
        [guildId, userId],
    );
    return result.rows[0] || null;
}

async function getPendingSubmissions(guildId, limit = 10) {
    const result = await query(
        `SELECT id, tournament_id, user_id, team_id, region, epic_name, submitted_kills, claimed_victory,
                ai_status, ai_confidence, ai_predicted_kills, ai_predicted_victory, created_at
         FROM submissions
         WHERE guild_id = $1 AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT $2`,
        [guildId, Math.min(Math.max(Number(limit) || 10, 1), 25)],
    );
    return result.rows;
}

const DASHBOARD_TABS = new Set(['pending', 'ai_corrected', 'approved', 'rejected', 'all']);

/**
 * The `ai_corrected` tab is the review surface: approved rows where a human ended up
 * disagreeing with what the AI read, so the accuracy of the verifier stays visible.
 */
async function getDashboardSubmissions(guildId, tab = 'pending', limit = 100) {
    const clamped = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const params = [guildId, clamped];
    let filter = '';

    if (tab === 'ai_corrected') {
        filter = "AND ai_corrected = TRUE";
    } else if (tab !== 'all' && DASHBOARD_TABS.has(tab)) {
        params.push(tab);
        filter = `AND status = $${params.length}`;
    }

    const result = await query(
        `SELECT id, tournament_id, user_id, team_id, region, epic_name, submitted_by,
                submitted_kills, claimed_victory, approved_kills, victory_awarded,
                screenshot_hash IS NOT NULL AS has_screenshot,
                ai_status, ai_confidence, ai_note,
                ai_predicted_kills, ai_predicted_victory, ai_predicted_epic_name, ai_corrected,
                status, reviewed_by, review_note, scored_at, created_at, updated_at
         FROM submissions
         WHERE guild_id = $1 ${filter}
         ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
         LIMIT $2`,
        params,
    );
    return result.rows;
}

async function getScreenshot(guildId, submissionId) {
    const result = await query(
        'SELECT screenshot_data, screenshot_mime FROM submissions WHERE guild_id = $1 AND id = $2',
        [guildId, submissionId],
    );
    return result.rows[0] || null;
}

/**
 * `scored_at` is preserved when re-approving so an edit never moves points into a
 * different month. Do not simplify to `scored_at = NOW()`.
 */
async function approveSubmission(guildId, submissionId, actorId, { kills, victory, note, teamId, action = 'approved' }) {
    return withTransaction(async (client) => {
        const current = await client.query(
            'SELECT * FROM submissions WHERE guild_id = $1 AND id = $2 FOR UPDATE',
            [guildId, submissionId],
        );
        const submission = current.rows[0];
        if (!submission || submission.status === 'removed') return null;

        if (victory && !submission.screenshot_hash) {
            throw new Error('A win requires a stored screenshot.');
        }

        const aiCorrected =
            submission.ai_status !== 'not_submitted' &&
            actorId !== AI_ACTOR &&
            (submission.ai_predicted_kills !== kills || Boolean(submission.ai_predicted_victory) !== Boolean(victory));

        const result = await client.query(
            `UPDATE submissions
             SET status = 'approved',
                 approved_kills = $3,
                 victory_awarded = $4,
                 team_id = COALESCE($5, team_id),
                 reviewed_by = $6,
                 review_note = $7,
                 ai_corrected = $8,
                 scored_at = CASE WHEN status = 'approved' THEN scored_at ELSE NOW() END,
                 updated_at = NOW()
             WHERE guild_id = $1 AND id = $2
             RETURNING *`,
            [guildId, submissionId, kills, Boolean(victory), teamId ?? null, actorId, note ?? null, aiCorrected],
        );

        await addLog(client, guildId, submissionId, actorId, action, { kills, victory: Boolean(victory), note });
        return result.rows[0];
    });
}

async function rejectSubmission(guildId, submissionId, actorId, note) {
    return withTransaction(async (client) => {
        const result = await client.query(
            `UPDATE submissions
             SET status = 'rejected', approved_kills = NULL, victory_awarded = FALSE,
                 reviewed_by = $3, review_note = $4, scored_at = NULL, updated_at = NOW()
             WHERE guild_id = $1 AND id = $2 AND status <> 'removed'
             RETURNING *`,
            [guildId, submissionId, actorId, note ?? null],
        );

        if (!result.rows[0]) return null;
        await addLog(client, guildId, submissionId, actorId, 'rejected', { note });
        return result.rows[0];
    });
}

async function removeSubmission(guildId, submissionId, actorId, note) {
    return withTransaction(async (client) => {
        const result = await client.query(
            `UPDATE submissions
             SET status = 'removed', approved_kills = NULL, victory_awarded = FALSE,
                 reviewed_by = $3, review_note = $4, scored_at = NULL, updated_at = NOW()
             WHERE guild_id = $1 AND id = $2 AND status <> 'removed'
             RETURNING *`,
            [guildId, submissionId, actorId, note ?? null],
        );

        if (!result.rows[0]) return null;
        await addLog(client, guildId, submissionId, actorId, 'removed', { note });
        return result.rows[0];
    });
}

async function getModerationLogs(guildId, limit = 10) {
    const result = await query(
        'SELECT * FROM moderation_logs WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2',
        [guildId, Math.min(Math.max(Number(limit) || 10, 1), 25)],
    );
    return result.rows;
}

async function getAiAccuracy(guildId, sampleSize = 100) {
    const clamped = Math.min(Math.max(Number(sampleSize) || 100, 1), 500);
    const result = await query(
        `WITH sample AS (
            SELECT ai_corrected FROM submissions
            WHERE guild_id = $1
              AND status IN ('approved', 'rejected')
              AND reviewed_by IS NOT NULL AND reviewed_by <> $3
              AND ai_status IN ('verified', 'rejected', 'manual_review')
            ORDER BY updated_at DESC
            LIMIT $2
        )
        SELECT COUNT(*)::INTEGER AS total,
               COUNT(*) FILTER (WHERE ai_corrected = FALSE)::INTEGER AS correct
        FROM sample`,
        [guildId, clamped, AI_ACTOR],
    );

    const { total, correct } = result.rows[0];
    return { sampleSize: total, correct, accuracy: total ? correct / total : null };
}

module.exports = {
    AI_ACTOR,
    approveSubmission,
    createSubmission,
    getAiAccuracy,
    getDashboardSubmissions,
    getLatestSubmission,
    getModerationLogs,
    getPendingSubmissions,
    getScreenshot,
    getSubmission,
    rejectSubmission,
    removeSubmission,
};
