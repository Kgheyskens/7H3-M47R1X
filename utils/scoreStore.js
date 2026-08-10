const { query } = require('./db');

/**
 * Kept in sync with the SQL aggregates below. Both formulas must change together.
 */
function calculatePoints(kills, victory = false, pointsPerKill = 1, pointsPerWin = 10) {
    if (!Number.isInteger(kills) || kills < 0) {
        throw new TypeError('Approved kills must be a non-negative integer.');
    }
    return kills * pointsPerKill + (victory ? pointsPerWin : 0);
}

const POINTS_EXPRESSION = `
    COALESCE(SUM(
        COALESCE(s.approved_kills, 0) * $2
        + CASE WHEN s.victory_awarded THEN $3 ELSE 0 END
    ), 0)::INTEGER`;

async function pointConfig(guildId) {
    const result = await query(
        'SELECT points_per_kill, points_per_win FROM guild_config WHERE guild_id = $1',
        [guildId],
    );
    return {
        perKill: result.rows[0]?.points_per_kill ?? 1,
        perWin: result.rows[0]?.points_per_win ?? 10,
    };
}

async function getTeamStandings(guildId, tournamentId = null) {
    const { perKill, perWin } = await pointConfig(guildId);
    const params = [guildId, perKill, perWin];
    let filter = '';
    if (tournamentId) {
        params.push(tournamentId);
        filter = `AND s.tournament_id = $${params.length}`;
    }

    const result = await query(
        `SELECT t.id AS team_id, t.name, t.role_id,
                COUNT(*) FILTER (WHERE s.victory_awarded)::INTEGER AS wins,
                COALESCE(SUM(s.approved_kills), 0)::INTEGER AS kills,
                COUNT(DISTINCT s.user_id)::INTEGER AS players,
                ${POINTS_EXPRESSION} AS points
         FROM teams t
         LEFT JOIN submissions s
           ON s.team_id = t.id AND s.status = 'approved' AND s.guild_id = t.guild_id ${filter}
         WHERE t.guild_id = $1
         GROUP BY t.id, t.name, t.role_id
         ORDER BY points DESC, wins DESC, kills DESC, t.name`,
        params,
    );
    return result.rows;
}

async function getPlayerStandings(guildId, tournamentId = null, limit = 25) {
    const { perKill, perWin } = await pointConfig(guildId);
    const params = [guildId, perKill, perWin];
    let filter = '';
    if (tournamentId) {
        params.push(tournamentId);
        filter = `AND s.tournament_id = $${params.length}`;
    }
    params.push(Math.min(Math.max(Number(limit) || 25, 1), 50));

    const result = await query(
        `SELECT s.user_id, s.team_id, MAX(t.name) AS team_name,
                COUNT(*) FILTER (WHERE s.victory_awarded)::INTEGER AS wins,
                COALESCE(SUM(s.approved_kills), 0)::INTEGER AS kills,
                ${POINTS_EXPRESSION} AS points
         FROM submissions s
         LEFT JOIN teams t ON t.id = s.team_id
         WHERE s.guild_id = $1 AND s.status = 'approved' ${filter}
         GROUP BY s.user_id, s.team_id
         ORDER BY points DESC, wins DESC, kills DESC, s.user_id
         LIMIT $${params.length}`,
        params,
    );
    return result.rows;
}

async function getTournamentSummary(guildId, tournamentId) {
    const { perKill, perWin } = await pointConfig(guildId);
    const result = await query(
        `SELECT COUNT(*)::INTEGER AS submissions,
                COUNT(*) FILTER (WHERE s.status = 'pending')::INTEGER AS pending,
                COUNT(*) FILTER (WHERE s.status = 'approved' AND s.victory_awarded)::INTEGER AS wins,
                COALESCE(SUM(s.approved_kills) FILTER (WHERE s.status = 'approved'), 0)::INTEGER AS kills,
                COALESCE(SUM(
                    COALESCE(s.approved_kills, 0) * $2
                    + CASE WHEN s.victory_awarded THEN $3 ELSE 0 END
                ) FILTER (WHERE s.status = 'approved'), 0)::INTEGER AS points
         FROM submissions s
         WHERE s.guild_id = $1 AND s.tournament_id = $4`,
        [guildId, perKill, perWin, tournamentId],
    );
    return result.rows[0];
}

module.exports = {
    calculatePoints,
    getPlayerStandings,
    getTeamStandings,
    getTournamentSummary,
    pointConfig,
};
