const { query } = require('./db');

const DEFAULT_CONFIG = {
    setup_completed: false,
    setup_step: null,
    welcome_enabled: false,
    welcome_channel_id: null,
    welcome_message: null,
    goodbye_enabled: false,
    goodbye_channel_id: null,
    goodbye_message: null,
    rules_channel_id: null,
    rules_message: null,
    rules_message_id: null,
    rules_accept_enabled: false,
    rules_accept_role_id: null,
    roles_panel_channel_id: null,
    roles_panel_message_id: null,
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

module.exports = {
    DEFAULT_CONFIG,
    ensureConfig,
    getConfig,
    isSetupCompleted,
    updateConfig,
};
