const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
    ? new Pool({
        connectionString,
        max: 10,
        ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    })
    : null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
    setup_step TEXT,
    announcement_channel_id TEXT,
    submission_channel_id TEXT,
    leaderboard_channel_id TEXT,
    team_panel_channel_id TEXT,
    shop_channel_id TEXT,
    news_channel_id TEXT,
    news_mention_role_id TEXT,
    staff_role_id TEXT,
    shop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    news_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    player_submissions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    team_switching_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    points_per_kill INTEGER NOT NULL DEFAULT 1 CHECK (points_per_kill >= 0),
    points_per_win INTEGER NOT NULL DEFAULT 10 CHECK (points_per_win >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS teams_role_once ON teams (guild_id, role_id);

CREATE TABLE IF NOT EXISTS team_members (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    team_id BIGINT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS team_members_team ON team_members (team_id);

CREATE TABLE IF NOT EXISTS tournaments (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'live', 'closed')),
    starts_at TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tournaments_guild_status ON tournaments (guild_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS tournament_regions (
    id BIGSERIAL PRIMARY KEY,
    tournament_id BIGINT NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    region TEXT NOT NULL,
    creator_code TEXT,
    lobby_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_region_once ON tournament_regions (tournament_id, region);

CREATE TABLE IF NOT EXISTS registrations (
    id BIGSERIAL PRIMARY KEY,
    tournament_id BIGINT NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    epic_name TEXT NOT NULL,
    region TEXT NOT NULL,
    team_id BIGINT REFERENCES teams (id) ON DELETE SET NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS registration_once ON registrations (tournament_id, user_id);
CREATE INDEX IF NOT EXISTS registrations_epic ON registrations (tournament_id, LOWER(epic_name));

CREATE TABLE IF NOT EXISTS submissions (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    tournament_id BIGINT REFERENCES tournaments (id) ON DELETE SET NULL,
    user_id TEXT NOT NULL,
    team_id BIGINT REFERENCES teams (id) ON DELETE SET NULL,
    region TEXT,
    epic_name TEXT,
    submitted_by TEXT NOT NULL,
    submitted_kills INTEGER NOT NULL CHECK (submitted_kills BETWEEN 0 AND 100),
    claimed_victory BOOLEAN NOT NULL DEFAULT FALSE,
    approved_kills INTEGER,
    victory_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    screenshot_hash TEXT,
    screenshot_data BYTEA,
    screenshot_mime TEXT,
    screenshot_url TEXT,
    ai_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (
        ai_status IN ('not_submitted', 'verified', 'rejected', 'manual_review', 'unavailable')
    ),
    ai_confidence NUMERIC(5,4),
    ai_note TEXT,
    ai_predicted_kills INTEGER,
    ai_predicted_victory BOOLEAN,
    ai_predicted_epic_name TEXT,
    ai_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'approved', 'rejected', 'removed')
    ),
    reviewed_by TEXT,
    review_note TEXT,
    scored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The same image can never be submitted twice within a guild, by anyone.
CREATE UNIQUE INDEX IF NOT EXISTS submission_screenshot_once
ON submissions (guild_id, screenshot_hash)
WHERE screenshot_hash IS NOT NULL;

-- At most one approved victory per player per tournament.
CREATE UNIQUE INDEX IF NOT EXISTS submission_victory_once
ON submissions (tournament_id, user_id)
WHERE status = 'approved' AND victory_awarded = TRUE;

CREATE INDEX IF NOT EXISTS submissions_review_queue
ON submissions (guild_id, status, created_at);

CREATE INDEX IF NOT EXISTS submissions_scoring
ON submissions (guild_id, status, scored_at);

CREATE TABLE IF NOT EXISTS moderation_logs (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    submission_id BIGINT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_logs_guild ON moderation_logs (guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS live_boards (
    guild_id TEXT NOT NULL,
    board_type TEXT NOT NULL CHECK (board_type IN ('team', 'player', 'tournament')),
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    tournament_id BIGINT REFERENCES tournaments (id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, board_type)
);

CREATE TABLE IF NOT EXISTS team_panels (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fortnite_shop_panels (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    message_ids TEXT[] NOT NULL DEFAULT '{}',
    shop_hash TEXT,
    format_version TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fortnite_news_feeds (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    mention_role_id TEXT,
    seen_news_ids TEXT[] NOT NULL DEFAULT '{}',
    last_build TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
    ip TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let schemaPromise;

function requireDatabase() {
    if (!pool) {
        throw new Error('DATABASE_URL is not configured.');
    }

    if (!schemaPromise) {
        schemaPromise = pool.query(SCHEMA);
    }

    return schemaPromise;
}

async function query(text, params) {
    await requireDatabase();
    return pool.query(text, params);
}

async function withTransaction(callback) {
    await requireDatabase();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { pool, query, requireDatabase, withTransaction };
