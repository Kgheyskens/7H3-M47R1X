const { query } = require('./db');

const DEFAULT_CONFIG = {
    setup_completed: false,
    setup_step: null,
    announcement_channel_id: null,
    submission_channel_id: null,
    leaderboard_channel_id: null,
    team_panel_channel_id: null,
    shop_channel_id: null,
    news_channel_id: null,
    news_mention_role_id: null,
    staff_role_id: null,
    shop_enabled: false,
    news_enabled: false,
    ai_enabled: true,
    player_submissions_enabled: true,
    team_switching_allowed: false,
    points_per_kill: 1,
    points_per_win: 10,
};

const UPDATABLE_FIELDS = new Set(Object.keys(DEFAULT_CONFIG));

async function getConfig(guildId) {
    const result = await query('SELECT * FROM guild_config WHERE guild_id = $1', [guildId]);
    return result.rows[0] || { guild_id: guildId, ...DEFAULT_CONFIG };
}

async function ensureConfig(guildId) {
    const result = await query(
        `INSERT INTO guild_config (guild_id) VALUES ($1)
         ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [guildId],
    );
    return result.rows[0];
}

async function updateConfig(guildId, patch) {
    const entries = Object.entries(patch).filter(([key]) => UPDATABLE_FIELDS.has(key));
    if (!entries.length) return getConfig(guildId);

    const columns = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    const insertPlaceholders = columns.map((_, index) => `$${index + 2}`);
    const updateAssignments = columns.map((column) => `${column} = EXCLUDED.${column}`);

    const result = await query(
        `INSERT INTO guild_config (guild_id, ${columns.join(', ')})
         VALUES ($1, ${insertPlaceholders.join(', ')})
         ON CONFLICT (guild_id) DO UPDATE SET ${updateAssignments.join(', ')}, updated_at = NOW()
         RETURNING *`,
        [guildId, ...values],
    );

    return result.rows[0];
}

async function isSetupCompleted(guildId) {
    const result = await query('SELECT setup_completed FROM guild_config WHERE guild_id = $1', [guildId]);
    return Boolean(result.rows[0]?.setup_completed);
}

async function getConfiguredGuildIds() {
    const result = await query('SELECT guild_id FROM guild_config WHERE setup_completed = TRUE');
    return result.rows.map((row) => row.guild_id);
}

/**
 * Setup is only complete once a guild can actually run a tournament: at least two
 * teams to compete, and a channel to review submissions in.
 */
function missingRequirements(config, teamCount) {
    const missing = [];
    if (teamCount < 2) missing.push('At least two teams');
    if (!config.submission_channel_id) missing.push('Submission channel');
    if (!config.leaderboard_channel_id) missing.push('Leaderboard channel');
    if (config.shop_enabled && !config.shop_channel_id) missing.push('Item shop channel');
    if (config.news_enabled && !config.news_channel_id) missing.push('News channel');
    return missing;
}

module.exports = {
    DEFAULT_CONFIG,
    ensureConfig,
    getConfig,
    getConfiguredGuildIds,
    isSetupCompleted,
    missingRequirements,
    updateConfig,
};
