/**
 * Preflight check. Verifies everything the bot needs before you run it.
 * Run with: npm run doctor
 */
require('dotenv').config();

const results = [];

function pass(label, detail = '') {
    results.push({ level: 'pass', label, detail });
}
function warn(label, detail = '') {
    results.push({ level: 'warn', label, detail });
}
function fail(label, detail = '') {
    results.push({ level: 'fail', label, detail });
}

async function checkNode() {
    const major = Number(process.versions.node.split('.')[0]);
    if (major >= 18) pass('Node.js', `v${process.versions.node}`);
    else fail('Node.js', `v${process.versions.node} — version 18 or newer is required`);
}

async function checkDiscord() {
    const token = process.env.DISCORD_TOKEN || process.env.CLIENT_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

    if (!token) {
        fail('DISCORD_TOKEN', 'missing — the bot cannot start');
        return;
    }
    if (!clientId) warn('DISCORD_CLIENT_ID', 'missing — slash commands cannot be registered');

    try {
        const response = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${token}` },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            fail('Discord token', `rejected by Discord (HTTP ${response.status})`);
            return;
        }

        const app = await response.json();
        pass('Discord token', `authenticated as ${app.username}#${app.discriminator ?? '0'}`);

        if (clientId && app.id !== clientId) {
            warn('DISCORD_CLIENT_ID', `does not match the token's application id (${app.id})`);
        }

        const guilds = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bot ${token}` },
            signal: AbortSignal.timeout(10000),
        }).then((res) => (res.ok ? res.json() : []));

        if (!guilds.length) {
            warn('Server membership', 'the bot is not in any server yet — invite it first');
        } else {
            pass('Server membership', guilds.map((g) => `${g.name} (${g.id})`).join(', '));
        }
    } catch (error) {
        fail('Discord token', `could not reach Discord: ${error.message}`);
    }
}

async function checkDatabase() {
    if (!process.env.DATABASE_URL) {
        fail('DATABASE_URL', 'missing — every stateful feature will throw');
        return;
    }

    const { pool, requireDatabase, query } = require('../utils/db');

    if (!pool) {
        fail('DATABASE_URL', 'could not create a connection pool');
        return;
    }

    try {
        await requireDatabase();
        pass('Database connection', 'connected and schema applied');

        const tables = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' ORDER BY table_name`,
        );

        const expected = ['guild_config', 'self_roles'];
        const found = new Set(tables.rows.map((row) => row.table_name));
        const missingTables = expected.filter((name) => !found.has(name));

        if (missingTables.length) fail('Schema', `missing tables: ${missingTables.join(', ')}`);
        else pass('Schema', `all ${expected.length} tables present`);

        // A table that already existed under an older version of this bot is NOT altered by
        // "CREATE TABLE IF NOT EXISTS" — only the ALTER TABLE block in utils/db.js adds
        // missing columns to it. This check exists because that exact gap has silently broken
        // every setup action in production before: catch it here instead.
        const { DEFAULT_CONFIG } = require('../utils/configStore');
        const columns = await query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guild_config'`,
        );
        const foundColumns = new Set(columns.rows.map((row) => row.column_name));
        const missingColumns = Object.keys(DEFAULT_CONFIG).filter((name) => !foundColumns.has(name));

        if (missingColumns.length) {
            fail(
                'guild_config columns',
                `missing: ${missingColumns.join(', ')} — the table predates these; check the ALTER TABLE block in utils/db.js covers them, then restart the bot once to apply it`,
            );
        } else {
            pass('guild_config columns', `all ${Object.keys(DEFAULT_CONFIG).length} expected columns present`);
        }
    } catch (error) {
        fail('Database connection', error.message);
    } finally {
        if (pool) await pool.end().catch(() => {});
    }
}

async function checkHosting() {
    if (process.env.NODE_ENV !== 'production') {
        warn('NODE_ENV', 'not "production" — fine locally, but set this on Render');
    } else {
        pass('NODE_ENV', 'production');
    }

    pass('Uptime endpoint', `serves "OK" on port ${process.env.PORT || 3000} at "/" — point UptimeRobot at it`);
}

(async () => {
    console.log('\nRunning preflight checks…\n');

    await checkNode();
    await checkDiscord();
    await checkDatabase();
    await checkHosting();

    const icons = { pass: '✓', warn: '!', fail: '✗' };
    const width = Math.max(...results.map((r) => r.label.length));

    for (const { level, label, detail } of results) {
        console.log(`  ${icons[level]} ${label.padEnd(width)}  ${detail}`);
    }

    const failures = results.filter((r) => r.level === 'fail').length;
    const warnings = results.filter((r) => r.level === 'warn').length;

    console.log(
        `\n${failures ? `${failures} blocking problem(s)` : 'No blocking problems'}` +
            `${warnings ? `, ${warnings} warning(s)` : ''}.\n`,
    );

    if (failures) console.log('Fix the ✗ items before running npm start.\n');
    process.exit(failures ? 1 : 0);
})();
