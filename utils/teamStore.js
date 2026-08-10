const { query, withTransaction } = require('./db');

async function createTeam(guildId, roleId, name, color = null) {
    const result = await query(
        `INSERT INTO teams (guild_id, role_id, name, color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, role_id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color
         RETURNING *`,
        [guildId, roleId, name, color],
    );
    return result.rows[0];
}

async function getTeams(guildId) {
    const result = await query('SELECT * FROM teams WHERE guild_id = $1 ORDER BY id', [guildId]);
    return result.rows;
}

async function getTeam(guildId, teamId) {
    const result = await query('SELECT * FROM teams WHERE guild_id = $1 AND id = $2', [guildId, teamId]);
    return result.rows[0] || null;
}

async function deleteTeam(guildId, teamId) {
    const result = await query('DELETE FROM teams WHERE guild_id = $1 AND id = $2 RETURNING *', [guildId, teamId]);
    return result.rows[0] || null;
}

async function countTeams(guildId) {
    const result = await query('SELECT COUNT(*)::INTEGER AS count FROM teams WHERE guild_id = $1', [guildId]);
    return result.rows[0].count;
}

async function getMembership(guildId, userId) {
    const result = await query(
        `SELECT tm.team_id, tm.joined_at, t.role_id, t.name, t.color
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         WHERE tm.guild_id = $1 AND tm.user_id = $2`,
        [guildId, userId],
    );
    return result.rows[0] || null;
}

/**
 * First writer wins: the database decides, not app code, so two simultaneous
 * clicks on the join panel cannot both succeed.
 */
async function joinTeam(guildId, userId, teamId) {
    const result = await query(
        `INSERT INTO team_members (guild_id, user_id, team_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, user_id) DO NOTHING
         RETURNING team_id`,
        [guildId, userId, teamId],
    );

    if (result.rows.length) {
        return { created: true, membership: await getMembership(guildId, userId) };
    }

    return { created: false, membership: await getMembership(guildId, userId) };
}

async function switchTeam(guildId, userId, teamId) {
    const result = await query(
        `INSERT INTO team_members (guild_id, user_id, team_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET team_id = EXCLUDED.team_id, joined_at = NOW()
         RETURNING team_id`,
        [guildId, userId, teamId],
    );
    return result.rows[0] || null;
}

/** Compensating action for when the database row was written but Discord refused the role. */
async function rollbackJoin(guildId, userId, teamId) {
    await query('DELETE FROM team_members WHERE guild_id = $1 AND user_id = $2 AND team_id = $3', [
        guildId,
        userId,
        teamId,
    ]);
}

async function leaveTeam(guildId, userId) {
    const result = await query(
        'DELETE FROM team_members WHERE guild_id = $1 AND user_id = $2 RETURNING team_id',
        [guildId, userId],
    );
    return result.rows[0] || null;
}

async function getTeamPanel(guildId) {
    const result = await query('SELECT * FROM team_panels WHERE guild_id = $1', [guildId]);
    return result.rows[0] || null;
}

async function setTeamPanel(guildId, channelId, messageId) {
    await query(
        `INSERT INTO team_panels (guild_id, channel_id, message_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id) DO UPDATE
         SET channel_id = EXCLUDED.channel_id, message_id = EXCLUDED.message_id, updated_at = NOW()`,
        [guildId, channelId, messageId],
    );
}

async function replaceTeams(guildId, teams) {
    return withTransaction(async (client) => {
        await client.query('DELETE FROM teams WHERE guild_id = $1', [guildId]);
        const created = [];
        for (const team of teams) {
            const result = await client.query(
                'INSERT INTO teams (guild_id, role_id, name, color) VALUES ($1, $2, $3, $4) RETURNING *',
                [guildId, team.roleId, team.name, team.color ?? null],
            );
            created.push(result.rows[0]);
        }
        return created;
    });
}

module.exports = {
    countTeams,
    createTeam,
    deleteTeam,
    getMembership,
    getTeam,
    getTeamPanel,
    getTeams,
    joinTeam,
    leaveTeam,
    replaceTeams,
    rollbackJoin,
    setTeamPanel,
    switchTeam,
};
