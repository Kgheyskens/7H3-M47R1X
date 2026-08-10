const { query, withTransaction } = require('./db');

const REGIONS = [
    { value: 'EU', label: 'Europe' },
    { value: 'NAC', label: 'NA Central' },
    { value: 'NAE', label: 'NA East' },
    { value: 'NAW', label: 'NA West' },
    { value: 'BR', label: 'Brazil' },
    { value: 'ASIA', label: 'Asia' },
    { value: 'ME', label: 'Middle East' },
    { value: 'OCE', label: 'Oceania' },
];

const REGION_VALUES = new Set(REGIONS.map((region) => region.value));

async function createTournament({ guildId, name, description, startsAt, createdBy, regions }) {
    return withTransaction(async (client) => {
        const tournament = await client.query(
            `INSERT INTO tournaments (guild_id, name, description, starts_at, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [guildId, name, description ?? null, startsAt ?? null, createdBy],
        );

        for (const region of regions) {
            await client.query(
                'INSERT INTO tournament_regions (tournament_id, region) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [tournament.rows[0].id, region],
            );
        }

        return tournament.rows[0];
    });
}

async function getTournament(guildId, tournamentId) {
    const result = await query('SELECT * FROM tournaments WHERE guild_id = $1 AND id = $2', [guildId, tournamentId]);
    return result.rows[0] || null;
}

async function listTournaments(guildId, limit = 25) {
    const result = await query(
        'SELECT * FROM tournaments WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2',
        [guildId, Math.min(Math.max(Number(limit) || 25, 1), 25)],
    );
    return result.rows;
}

/** The tournament players implicitly submit to when they do not name one. */
async function getActiveTournament(guildId) {
    const result = await query(
        `SELECT * FROM tournaments
         WHERE guild_id = $1 AND status IN ('open', 'live')
         ORDER BY CASE status WHEN 'live' THEN 0 ELSE 1 END, created_at DESC
         LIMIT 1`,
        [guildId],
    );
    return result.rows[0] || null;
}

async function setTournamentStatus(guildId, tournamentId, status) {
    const result = await query(
        `UPDATE tournaments
         SET status = $3, closed_at = CASE WHEN $3 = 'closed' THEN NOW() ELSE NULL END
         WHERE guild_id = $1 AND id = $2
         RETURNING *`,
        [guildId, tournamentId, status],
    );
    return result.rows[0] || null;
}

async function getRegions(tournamentId) {
    const result = await query(
        'SELECT * FROM tournament_regions WHERE tournament_id = $1 ORDER BY region',
        [tournamentId],
    );
    return result.rows;
}

async function setCreatorCode(tournamentId, region, creatorCode, lobbyNote = null) {
    const result = await query(
        `INSERT INTO tournament_regions (tournament_id, region, creator_code, lobby_note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tournament_id, region) DO UPDATE
         SET creator_code = EXCLUDED.creator_code, lobby_note = EXCLUDED.lobby_note, updated_at = NOW()
         RETURNING *`,
        [tournamentId, region, creatorCode, lobbyNote],
    );
    return result.rows[0];
}

async function register({ tournamentId, guildId, userId, epicName, region, teamId }) {
    const result = await query(
        `INSERT INTO registrations (tournament_id, guild_id, user_id, epic_name, region, team_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tournament_id, user_id) DO UPDATE
         SET epic_name = EXCLUDED.epic_name, region = EXCLUDED.region, team_id = EXCLUDED.team_id
         RETURNING *`,
        [tournamentId, guildId, userId, epicName, region, teamId ?? null],
    );
    return result.rows[0];
}

async function getRegistration(tournamentId, userId) {
    const result = await query('SELECT * FROM registrations WHERE tournament_id = $1 AND user_id = $2', [
        tournamentId,
        userId,
    ]);
    return result.rows[0] || null;
}

/** Used to map an AI-read Epic name back to a Discord member. */
async function findRegistrationByEpicName(tournamentId, epicName) {
    const result = await query(
        'SELECT * FROM registrations WHERE tournament_id = $1 AND LOWER(epic_name) = LOWER($2) LIMIT 1',
        [tournamentId, epicName],
    );
    return result.rows[0] || null;
}

async function getRegistrations(tournamentId, region = null) {
    const params = [tournamentId];
    let sql = 'SELECT * FROM registrations WHERE tournament_id = $1';
    if (region) {
        params.push(region);
        sql += ' AND region = $2';
    }
    sql += ' ORDER BY registered_at';
    const result = await query(sql, params);
    return result.rows;
}

async function countRegistrations(tournamentId) {
    const result = await query(
        'SELECT COUNT(*)::INTEGER AS count FROM registrations WHERE tournament_id = $1',
        [tournamentId],
    );
    return result.rows[0].count;
}

module.exports = {
    REGIONS,
    REGION_VALUES,
    countRegistrations,
    createTournament,
    findRegistrationByEpicName,
    getActiveTournament,
    getRegions,
    getRegistration,
    getRegistrations,
    getTournament,
    listTournaments,
    register,
    setCreatorCode,
    setTournamentStatus,
};
