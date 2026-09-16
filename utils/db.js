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
