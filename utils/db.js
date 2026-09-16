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
    welcome_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    welcome_channel_id TEXT,
    welcome_message TEXT,
    goodbye_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    goodbye_channel_id TEXT,
    goodbye_message TEXT,
    rules_channel_id TEXT,
    rules_message TEXT,
    rules_message_id TEXT,
    rules_accept_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    rules_accept_role_id TEXT,
    roles_panel_channel_id TEXT,
    roles_panel_message_id TEXT,
    news_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    news_channel_id TEXT,
    news_feed_url TEXT,
    news_mention_role_id TEXT,
    news_seen_ids TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS self_roles (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('rank', 'agent')),
    role_id TEXT NOT NULL,
    label TEXT NOT NULL,
    group_name TEXT,
    emoji TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS self_roles_role_once ON self_roles (guild_id, role_id);
CREATE INDEX IF NOT EXISTS self_roles_lookup ON self_roles (guild_id, category, sort_order);

-- The role panel is several messages (one for rank, one per agent class), not one — this
-- tracks the message id for each so re-posting edits them in place instead of duplicating.
-- panel_key is 'rank' or 'agent:<class>'.
CREATE TABLE IF NOT EXISTS role_panel_messages (
    guild_id TEXT NOT NULL,
    panel_key TEXT NOT NULL,
    message_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, panel_key)
);

-- CREATE TABLE IF NOT EXISTS never adds a column to a table that already exists. guild_config
-- has existed since the very first (Fortnite) version of this bot and has been through several
-- shapes since — every column this bot currently reads or writes must be listed here, or a
-- guild whose table predates that column throws "column does not exist" on every action that
-- touches it. Each statement is idempotent; keep this list in sync with the CREATE TABLE above
-- rather than assuming a fresh database is the only one this ever runs against.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS setup_step TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS welcome_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS welcome_channel_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS goodbye_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS goodbye_channel_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS goodbye_message TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS rules_channel_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS rules_message TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS rules_message_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS rules_accept_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS rules_accept_role_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS roles_panel_channel_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS roles_panel_message_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS news_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS news_channel_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS news_feed_url TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS news_mention_role_id TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS news_seen_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
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
