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

        const expected = [
            'admin_login_attempts',
            'admin_sessions',
            'fortnite_news_feeds',
            'fortnite_shop_panels',
            'guild_config',
            'live_boards',
            'moderation_logs',
            'registrations',
            'submissions',
            'team_members',
            'team_panels',
            'teams',
            'tournament_regions',
            'tournaments',
        ];

        const found = new Set(tables.rows.map((row) => row.table_name));
        const missing = expected.filter((name) => !found.has(name));

        if (missing.length) fail('Schema', `missing tables: ${missing.join(', ')}`);
        else pass('Schema', `all ${expected.length} tables present`);
    } catch (error) {
        fail('Database connection', error.message);
    } finally {
        if (pool) await pool.end().catch(() => {});
    }
}

async function checkAi() {
    const providers = [
        ['OpenRouter', process.env.OPENROUTER_API_KEY],
        ['Groq', process.env.GROQ_API_KEY],
        ['Gemini', process.env.GEMINI_API_KEY],
    ].filter(([, key]) => key);

    if (!providers.length) {
        warn('AI verification', 'no provider key set — every submission goes to manual review');
        return;
    }

    pass('AI verification', `${providers.map(([name]) => name).join(', ')} configured`);
}

async function checkDashboard() {
    if (!process.env.ADMIN_DASHBOARD_TOKEN) {
        warn('ADMIN_DASHBOARD_TOKEN', 'missing — the web dashboard cannot be signed into');
    } else if (process.env.ADMIN_DASHBOARD_TOKEN.length < 12) {
        warn('ADMIN_DASHBOARD_TOKEN', 'shorter than 12 characters — use something longer');
    } else {
        pass('ADMIN_DASHBOARD_TOKEN', 'set');
    }

    if (!process.env.DASHBOARD_URL) {
        warn('DASHBOARD_URL', 'not set — /review dashboard cannot show a link (fine for local testing)');
    } else {
        pass('DASHBOARD_URL', process.env.DASHBOARD_URL);
    }

    if (process.env.NODE_ENV !== 'production') {
        warn('NODE_ENV', 'not "production" — session cookies are sent without the Secure flag');
    } else {
        pass('NODE_ENV', 'production');
    }
}

async function checkFortnite() {
    try {
        const response = await fetch('https://fortnite-api.com/v2/aes', { signal: AbortSignal.timeout(10000) });
        if (response.ok) {
            const data = await response.json();
            pass('Fortnite API', `reachable (build ${data?.data?.build ?? 'unknown'})`);
        } else {
            warn('Fortnite API', `responded with HTTP ${response.status}`);
        }
    } catch (error) {
        warn('Fortnite API', `unreachable: ${error.message}`);
    }
}

(async () => {
    console.log('\nRunning preflight checks…\n');

    await checkNode();
    await checkDiscord();
    await checkDatabase();
    await checkAi();
    await checkDashboard();
    await checkFortnite();

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
