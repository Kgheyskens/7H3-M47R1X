const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { query } = require('./db');
const { refreshGuildBoards } = require('./leaderboards');
const store = require('./submissionStore');
const teamStore = require('./teamStore');

const PUBLIC_DIRECTORY = path.join(__dirname, '..', 'public', 'admin');

/** Allowlisted assets resolved to absolute paths at boot; never built from request data. */
const STATIC_FILES = {
    '/admin': { file: path.join(PUBLIC_DIRECTORY, 'index.html'), type: 'text/html; charset=utf-8', auth: true },
    '/admin/login': { file: path.join(PUBLIC_DIRECTORY, 'login.html'), type: 'text/html; charset=utf-8', auth: false },
    '/admin/app.css': { file: path.join(PUBLIC_DIRECTORY, 'app.css'), type: 'text/css; charset=utf-8', auth: true },
    '/admin/app.js': { file: path.join(PUBLIC_DIRECTORY, 'app.js'), type: 'text/javascript; charset=utf-8', auth: true },
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 100_000;
const MAX_LOGIN_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function send(res, status, body, headers = {}) {
    res.writeHead(status, {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'same-origin',
        'Content-Security-Policy':
            "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
        ...headers,
    });
    res.end(body);
}

function sendJson(res, status, payload, headers = {}) {
    send(res, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
}

function parseCookies(header) {
    const cookies = {};
    for (const part of String(header || '').split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return cookies;
}

function safeEqual(a, b) {
    const left = Buffer.from(String(a || ''));
    const right = Buffer.from(String(b || ''));
    // timingSafeEqual throws on a length mismatch, so the lengths are compared first.
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return req.socket.remoteAddress || 'unknown';
}

async function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > MAX_BODY_BYTES) {
                reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

async function readJson(req) {
    const body = await readBody(req);
    if (!body) return {};
    try {
        return JSON.parse(body);
    } catch {
        throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
    }
}

async function createSession() {
    const id = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await query('INSERT INTO admin_sessions (id, expires_at) VALUES ($1, $2)', [id, expiresAt]);
    await query('DELETE FROM admin_sessions WHERE expires_at < NOW()');
    return id;
}

async function isAuthenticated(req) {
    const sessionId = parseCookies(req.headers.cookie).admin_session;
    if (!sessionId) return false;

    const result = await query('SELECT 1 FROM admin_sessions WHERE id = $1 AND expires_at > NOW()', [sessionId]);
    return result.rows.length > 0;
}

async function destroySession(req) {
    const sessionId = parseCookies(req.headers.cookie).admin_session;
    if (sessionId) await query('DELETE FROM admin_sessions WHERE id = $1', [sessionId]);
}

async function checkLockout(ip) {
    const result = await query('SELECT failures, locked_until FROM admin_login_attempts WHERE ip = $1', [ip]);
    const row = result.rows[0];
    if (row?.locked_until && new Date(row.locked_until) > new Date()) {
        return Math.ceil((new Date(row.locked_until) - Date.now()) / 60000);
    }
    return 0;
}

async function recordFailure(ip) {
    await query(
        `INSERT INTO admin_login_attempts (ip, failures, locked_until)
         VALUES ($1, 1, NULL)
         ON CONFLICT (ip) DO UPDATE
         SET failures = admin_login_attempts.failures + 1,
             locked_until = CASE
                 WHEN admin_login_attempts.failures + 1 >= $2 THEN NOW() + $3 * INTERVAL '1 millisecond'
                 ELSE admin_login_attempts.locked_until
             END,
             updated_at = NOW()`,
        [ip, MAX_LOGIN_FAILURES, LOCKOUT_MS],
    );
}

async function clearFailures(ip) {
    await query('DELETE FROM admin_login_attempts WHERE ip = $1', [ip]);
}

function sessionCookie(sessionId, maxAgeSeconds) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `admin_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

/** Rejects a missing Origin too, unlike the pattern this replaces. */
function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return false;
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
}

function serveStatic(res, entry) {
    let contents;
    try {
        contents = fs.readFileSync(entry.file);
    } catch {
        sendJson(res, 404, { error: 'Not found.' });
        return;
    }
    send(res, 200, contents, { 'Content-Type': entry.type });
}

async function enrich(guild, submission) {
    const member = await guild.members.fetch(submission.user_id).catch(() => null);
    const team = submission.team_id ? await teamStore.getTeam(guild.id, submission.team_id).catch(() => null) : null;

    return {
        ...submission,
        player_name: member?.displayName || member?.user?.username || submission.user_id,
        team_name: team?.name || null,
        ai_disagrees_with_player:
            submission.ai_predicted_victory !== null &&
            submission.ai_predicted_victory !== submission.claimed_victory,
        epic_name_mismatch:
            Boolean(submission.ai_predicted_epic_name && submission.epic_name) &&
            submission.ai_predicted_epic_name.toLowerCase() !== submission.epic_name.toLowerCase(),
    };
}

function createDashboardHandler(client) {
    return async function handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const { pathname } = url;

        try {
            if (pathname === '/' || pathname === '/health') {
                send(res, 200, 'The tournament bot is online.', { 'Content-Type': 'text/plain; charset=utf-8' });
                return;
            }

            if (!pathname.startsWith('/admin')) {
                sendJson(res, 404, { error: 'Not found.' });
                return;
            }

            if (pathname === '/admin/login' && req.method === 'POST') {
                const ip = clientIp(req);
                const lockedMinutes = await checkLockout(ip);
                if (lockedMinutes) {
                    sendJson(res, 429, { error: `Too many attempts. Try again in ${lockedMinutes} minute(s).` });
                    return;
                }

                const secret = process.env.ADMIN_DASHBOARD_TOKEN;
                const { token } = await readJson(req);

                if (!secret || !safeEqual(token, secret)) {
                    await recordFailure(ip);
                    sendJson(res, 401, { error: 'Invalid administrator code.' });
                    return;
                }

                await clearFailures(ip);
                const sessionId = await createSession();
                sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(sessionId, SESSION_TTL_MS / 1000) });
                return;
            }

            if (pathname === '/admin/logout') {
                await destroySession(req);
                send(res, 302, '', { Location: '/admin/login', 'Set-Cookie': sessionCookie('', 0) });
                return;
            }

            const publicEntry = STATIC_FILES[pathname];
            if (publicEntry && !publicEntry.auth && req.method === 'GET') {
                serveStatic(res, publicEntry);
                return;
            }

            const authenticated = await isAuthenticated(req);
            if (!authenticated) {
                if (pathname.startsWith('/admin/api/')) {
                    sendJson(res, 401, { error: 'Please log in again.' });
                } else {
                    send(res, 302, '', { Location: '/admin/login' });
                }
                return;
            }

            if (publicEntry && req.method === 'GET') {
                serveStatic(res, publicEntry);
                return;
            }

            if (req.method === 'POST' && !sameOrigin(req)) {
                sendJson(res, 403, { error: 'Invalid request origin.' });
                return;
            }

            if (pathname === '/admin/api/guilds' && req.method === 'GET') {
                sendJson(res, 200, {
                    guilds: [...client.guilds.cache.values()].map((guild) => ({ id: guild.id, name: guild.name })),
                });
                return;
            }

            const guildId = url.searchParams.get('guildId');
            const guild = guildId ? client.guilds.cache.get(guildId) : null;

            if (pathname === '/admin/api/submissions' && req.method === 'GET') {
                if (!guild) {
                    sendJson(res, 400, { error: 'Unknown server.' });
                    return;
                }

                const tab = url.searchParams.get('tab') || 'pending';
                const rows = await store.getDashboardSubmissions(guild.id, tab);
                const submissions = await Promise.all(rows.map((row) => enrich(guild, row)));
                const aiStats = await store.getAiAccuracy(guild.id).catch(() => null);

                sendJson(res, 200, { submissions, aiStats });
                return;
            }

            const screenshotMatch = pathname.match(/^\/admin\/api\/submissions\/(\d+)\/screenshot$/);
            if (screenshotMatch && req.method === 'GET') {
                if (!guild) {
                    sendJson(res, 400, { error: 'Unknown server.' });
                    return;
                }

                const row = await store.getScreenshot(guild.id, screenshotMatch[1]);
                if (!row?.screenshot_data) {
                    sendJson(res, 404, { error: 'No screenshot found.' });
                    return;
                }

                send(res, 200, row.screenshot_data, { 'Content-Type': row.screenshot_mime || 'image/jpeg' });
                return;
            }

            const decisionMatch = pathname.match(/^\/admin\/api\/submissions\/(\d+)\/(approve|reject)$/);
            if (decisionMatch && req.method === 'POST') {
                const body = await readJson(req);
                const targetGuild = client.guilds.cache.get(body.guildId);

                if (!targetGuild) {
                    sendJson(res, 400, { error: 'Unknown server.' });
                    return;
                }

                const submissionId = decisionMatch[1];
                const actor = process.env.ADMIN_ACTOR_ID || 'web-dashboard';

                let updated;
                if (decisionMatch[2] === 'approve') {
                    const membership = await teamStore.getMembership(targetGuild.id, body.userId).catch(() => null);
                    updated = await store.approveSubmission(targetGuild.id, submissionId, actor, {
                        kills: Number(body.kills) || 0,
                        victory: Boolean(body.victory),
                        note: body.note || null,
                        teamId: membership?.team_id ?? null,
                        action: 'dashboard_approved',
                    });
                } else {
                    updated = await store.rejectSubmission(
                        targetGuild.id,
                        submissionId,
                        actor,
                        body.note || 'Rejected through the dashboard.',
                    );
                }

                if (!updated) {
                    sendJson(res, 404, { error: 'Submission not found.' });
                    return;
                }

                await refreshGuildBoards(targetGuild).catch(() => {});
                sendJson(res, 200, { submission: await enrich(targetGuild, updated) });
                return;
            }

            sendJson(res, 404, { error: 'Not found.' });
        } catch (error) {
            console.error('Dashboard error:', error);
            sendJson(res, error.status || 500, { error: error.message || 'Something went wrong.' });
        }
    };
}

module.exports = createDashboardHandler;
