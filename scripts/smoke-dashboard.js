/**
 * Boots the dashboard against an in-memory Postgres and exercises the real HTTP
 * routes end to end: login throttling, session auth, the tabs, and approving a
 * submission. Requires pg-mem (dev-only): npm install --no-save pg-mem
 *
 * Run with: node scripts/smoke-dashboard.js
 */
const assert = require('node:assert/strict');
const http = require('node:http');

const { newDb } = require('pg-mem');

process.env.ADMIN_DASHBOARD_TOKEN = 'smoke-test-token-1234';
process.env.DATABASE_URL = 'postgres://smoke/test';
delete process.env.NODE_ENV;

const GUILD_ID = '1492550028504338563';

// Route utils/db.js at the in-memory database before anything requires it.
const memory = newDb();
const adapter = memory.adapters.createPg();
require.cache[require.resolve('pg')] = { id: 'pg', filename: 'pg', loaded: true, exports: adapter };

const db = require('../utils/db');
const submissionStore = require('../utils/submissionStore');
const createDashboardHandler = require('../utils/dashboard');

const fakeGuild = {
    id: GUILD_ID,
    name: 'Smoke Test Server',
    client: { user: { id: 'bot' } },
    members: { fetch: async () => ({ displayName: 'TestPlayer', user: { username: 'TestPlayer' } }) },
    channels: { fetch: async () => null },
    roles: { cache: new Map() },
};

const fakeClient = { guilds: { cache: new Map([[GUILD_ID, fakeGuild]]) } };

let cookie = '';

async function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(
            {
                host: '127.0.0.1',
                port: server.address().port,
                method,
                path,
                headers: {
                    'Content-Type': 'application/json',
                    ...(cookie ? { Cookie: cookie } : {}),
                    // POSTs require a same-origin header.
                    ...(method === 'POST' ? { Origin: `http://127.0.0.1:${server.address().port}` } : {}),
                    ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                },
            },
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks);
                    const setCookie = res.headers['set-cookie']?.[0];
                    if (setCookie) cookie = setCookie.split(';')[0];

                    let json = null;
                    try {
                        json = JSON.parse(raw.toString());
                    } catch {
                        /* not JSON, that is fine */
                    }
                    resolve({ status: res.statusCode, headers: res.headers, body: raw, json });
                });
            },
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

const handler = createDashboardHandler(fakeClient);
const server = http.createServer((req, res) => handler(req, res));

(async () => {
    server.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));

    const checks = [];
    const record = (label) => {
        checks.push(label);
        console.log(`  ✓ ${label}`);
    };

    try {
        await db.requireDatabase();
        record('schema applied to an empty database');

        // --- Auth -----------------------------------------------------------
        let res = await request('GET', '/admin');
        assert.equal(res.status, 302, 'unauthenticated /admin must redirect');
        assert.equal(res.headers.location, '/admin/login');
        record('unauthenticated /admin redirects to the login page');

        res = await request('GET', '/admin/api/submissions?guildId=' + GUILD_ID);
        assert.equal(res.status, 401);
        record('unauthenticated API returns 401, not a redirect');

        // The CSP forbids inline scripts and styles, so every page must load its JS and CSS
        // from a file. An inline <script> would be silently dropped by the browser and the
        // login form would fall back to a plain GET, which looks like "the page just reloads".
        const loginHtml = (await request('GET', '/admin/login')).body.toString();
        assert.doesNotMatch(loginHtml, /<script(?![^>]*\bsrc=)[^>]*>/, 'the login page must not use an inline <script>');
        assert.doesNotMatch(loginHtml, /<style[\s>]/, 'the login page must not use an inline <style>');
        assert.doesNotMatch(loginHtml, /\son[a-z]+=/, 'the login page must not use an inline event handler');
        record('the login page has no inline script, style or handler the CSP would block');

        // Assets the login page pulls in must be reachable while still signed out.
        for (const asset of ['/admin/login.css', '/admin/login.js']) {
            assert.equal((await request('GET', asset)).status, 200, `${asset} must load before login`);
        }
        record('the login page assets are served to anonymous visitors');

        res = await request('POST', '/admin/login', { token: 'wrong' });
        assert.equal(res.status, 401);
        record('a wrong administrator code is rejected');

        res = await request('POST', '/admin/login', { token: 'smoke-test-token-1234' });
        assert.equal(res.status, 200);
        assert.ok(cookie.startsWith('admin_session='), 'a session cookie must be issued');
        record('the correct code signs in and issues a session cookie');

        res = await request('GET', '/admin');
        assert.equal(res.status, 200);
        assert.match(res.body.toString(), /Tournament dashboard/);
        assert.doesNotMatch(res.body.toString(), /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline <script>');
        assert.doesNotMatch(res.body.toString(), /<style[\s>]/, 'no inline <style>');
        record('the dashboard page loads once signed in, with no CSP-blocked inline code');

        // --- Seed a submission ----------------------------------------------
        await db.query('INSERT INTO guild_config (guild_id, setup_completed) VALUES ($1, TRUE)', [GUILD_ID]);
        const team = await db.query(
            'INSERT INTO teams (guild_id, role_id, name) VALUES ($1, $2, $3) RETURNING *',
            [GUILD_ID, 'role-1', 'Team Alpha'],
        );

        const submission = await submissionStore.createSubmission({
            guildId: GUILD_ID,
            tournamentId: null,
            userId: 'player-1',
            teamId: team.rows[0].id,
            region: 'EU',
            epicName: 'TestPlayer',
            submittedBy: 'player-1',
            kills: 5,
            claimedVictory: true,
            screenshotHash: 'abc123',
            screenshotData: Buffer.from('not-a-real-image'),
            screenshotMime: 'image/png',
            aiStatus: 'manual_review',
            aiConfidence: 0.72,
            aiNote: 'Banner partially covered.',
            aiPredictedKills: 6,
            aiPredictedVictory: true,
            aiPredictedEpicName: 'SomeoneElse',
        });
        record('a submission with AI predictions can be stored');

        // --- Tabs -----------------------------------------------------------
        res = await request('GET', `/admin/api/submissions?guildId=${GUILD_ID}&tab=pending`);
        assert.equal(res.status, 200);
        assert.equal(res.json.submissions.length, 1);

        const card = res.json.submissions[0];
        assert.equal(card.player_name, 'TestPlayer', 'the Discord display name must be resolved');
        assert.equal(card.team_name, 'Team Alpha');
        assert.equal(card.has_screenshot, true);
        assert.equal(card.epic_name_mismatch, true, 'a differing Epic name must be flagged');
        record('the Pending tab returns an enriched card and flags the name mismatch');

        res = await request('GET', `/admin/api/submissions?guildId=${GUILD_ID}&tab=ai_corrected`);
        assert.equal(res.json.submissions.length, 0);
        record('the AI corrected tab is empty before any human overrules the AI');

        // --- Screenshot -----------------------------------------------------
        res = await request('GET', `/admin/api/submissions/${submission.id}/screenshot?guildId=${GUILD_ID}`);
        assert.equal(res.status, 200);
        assert.equal(res.headers['content-type'], 'image/png');
        assert.equal(res.body.toString(), 'not-a-real-image');
        record('the stored screenshot is served with its own content type');

        // --- Approve with a correction --------------------------------------
        res = await request('POST', `/admin/api/submissions/${submission.id}/approve`, {
            guildId: GUILD_ID,
            userId: 'player-1',
            kills: 5, // the AI read 6, so this is a correction
            victory: true,
            note: 'Counted manually.',
        });
        assert.equal(res.status, 200);
        assert.equal(res.json.submission.status, 'approved');
        assert.equal(res.json.submission.approved_kills, 5);
        assert.equal(res.json.submission.ai_corrected, true, 'overruling the AI must be recorded');
        record('approving with corrected kills marks the submission as AI-corrected');

        res = await request('GET', `/admin/api/submissions?guildId=${GUILD_ID}&tab=ai_corrected`);
        assert.equal(res.json.submissions.length, 1, 'the correction must surface in its tab');
        record('the corrected submission now appears in the AI corrected tab');

        // --- Scoring --------------------------------------------------------
        const { getTeamStandings, getPlayerStandings } = require('../utils/scoreStore');
        const teams = await getTeamStandings(GUILD_ID);
        assert.equal(teams[0].points, 15, '5 kills + 10 win bonus = 15');
        assert.equal(teams[0].wins, 1);
        assert.equal(teams[0].kills, 5);
        record('team standings compute 15 points (5 kills + 10 win bonus)');

        const players = await getPlayerStandings(GUILD_ID);
        assert.equal(players[0].points, 15);
        record('player standings agree with the team total');

        // --- Reject takes the points back -----------------------------------
        res = await request('POST', `/admin/api/submissions/${submission.id}/reject`, {
            guildId: GUILD_ID,
            note: 'Changed my mind.',
        });
        assert.equal(res.status, 200);
        const afterReject = await getTeamStandings(GUILD_ID);
        assert.equal(afterReject[0].points, 0, 'rejecting must remove the points immediately');
        record('rejecting an approved submission removes its points at once');

        // --- Moderation log -------------------------------------------------
        const logs = await submissionStore.getModerationLogs(GUILD_ID);
        const actions = logs.map((log) => log.action);
        assert.ok(actions.includes('submitted'));
        assert.ok(actions.includes('dashboard_approved'));
        assert.ok(actions.includes('rejected'));
        record('every action is written to the moderation log');

        // --- Logout ---------------------------------------------------------
        res = await request('GET', '/admin/logout');
        assert.equal(res.status, 302);
        cookie = '';
        res = await request('GET', '/admin/api/submissions?guildId=' + GUILD_ID);
        assert.equal(res.status, 401, 'the session must be dead after logging out');
        record('signing out invalidates the session server-side');

        console.log(`\n${checks.length} dashboard checks passed.\n`);
    } catch (error) {
        console.error(`\n✗ FAILED: ${error.message}\n`);
        if (error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        process.exitCode = 1;
    } finally {
        server.close();
        if (db.pool) await db.pool.end().catch(() => {});
    }
})();
