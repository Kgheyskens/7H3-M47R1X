const { query } = require('./db');

async function getRoles(guildId, category) {
    const result = await query(
        'SELECT * FROM self_roles WHERE guild_id = $1 AND category = $2 ORDER BY sort_order, label',
        [guildId, category],
    );
    return result.rows;
}

async function getAllRoles(guildId) {
    const result = await query('SELECT * FROM self_roles WHERE guild_id = $1 ORDER BY category, sort_order, label', [
        guildId,
    ]);
    return result.rows;
}

async function nextSortOrder(guildId, category) {
    const result = await query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM self_roles WHERE guild_id = $1 AND category = $2',
        [guildId, category],
    );
    return result.rows[0].next;
}

async function addRole(guildId, { category, roleId, label, group = null, emoji = null }) {
    const sortOrder = await nextSortOrder(guildId, category);
    const result = await query(
        `INSERT INTO self_roles (guild_id, category, role_id, label, group_name, emoji, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (guild_id, role_id) DO UPDATE SET label = EXCLUDED.label, group_name = EXCLUDED.group_name
         RETURNING *`,
        [guildId, category, roleId, label, group, emoji, sortOrder],
    );
    return result.rows[0];
}

async function removeRole(guildId, roleId) {
    const result = await query('DELETE FROM self_roles WHERE guild_id = $1 AND role_id = $2 RETURNING *', [
        guildId,
        roleId,
    ]);
    return result.rows[0] || null;
}

async function clearCategory(guildId, category) {
    await query('DELETE FROM self_roles WHERE guild_id = $1 AND category = $2', [guildId, category]);
}

async function getGuildsWithCategory(category) {
    const result = await query('SELECT DISTINCT guild_id FROM self_roles WHERE category = $1', [category]);
    return result.rows.map((row) => row.guild_id);
}

module.exports = { addRole, clearCategory, getAllRoles, getGuildsWithCategory, getRoles, removeRole };
