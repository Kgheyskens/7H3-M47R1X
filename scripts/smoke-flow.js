/**
 * Walks the whole tournament flow against an in-memory Postgres with stubbed Discord
 * objects: setup gate, teams, registration, submission, approval, standings.
 * Requires pg-mem (dev dependency).
 *
 * Run with: npm run smoke:flow
 */
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');

process.env.DATABASE_URL = 'postgres://smoke/flow';

const GUILD_ID = '1492550028504338563';

const memory = newDb();
const adapter = memory.adapters.createPg();
require.cache[require.resolve('pg')] = { id: 'pg', filename: 'pg', loaded: true, exports: adapter };

const db = require('../utils/db');
const config = require('../utils/configStore');
const teamStore = require('../utils/teamStore');
const tournamentStore = require('../utils/tournamentStore');
const submissionStore = require('../utils/submissionStore');
const { getPlayerStandings, getTeamStandings, getTournamentSummary } = require('../utils/scoreStore');

const checks = [];
function record(label) {
    checks.push(label);
    console.log(`  ✓ ${label}`);
}

(async () => {
    try {
        await db.requireDatabase();

        // --- Setup gate -----------------------------------------------------
        await config.ensureConfig(GUILD_ID);
        assert.equal(await config.isSetupCompleted(GUILD_ID), false);
        record('a fresh guild starts with setup incomplete');

        let current = await config.getConfig(GUILD_ID);
        let missing = config.missingRequirements(current, 0);
        assert.ok(missing.includes('At least two teams'));
        assert.ok(missing.includes('Submission channel'));
        record('setup refuses to complete while requirements are missing');

        // One team is not enough to run a competition.
        await teamStore.createTeam(GUILD_ID, 'role-alpha', 'Team Alpha', 0xe74c3c);
        missing = config.missingRequirements(current, await teamStore.countTeams(GUILD_ID));
        assert.ok(missing.includes('At least two teams'), 'one team must still be rejected');
        record('a single team is not enough to finish setup');

        await teamStore.createTeam(GUILD_ID, 'role-bravo', 'Team Bravo', 0x3498db);
        await config.updateConfig(GUILD_ID, {
            submission_channel_id: 'chan-review',
            leaderboard_channel_id: 'chan-board',
            announcement_channel_id: 'chan-news',
        });

        current = await config.getConfig(GUILD_ID);
        missing = config.missingRequirements(current, await teamStore.countTeams(GUILD_ID));
        assert.deepEqual(missing, [], 'nothing should be missing now');
        record('two teams plus the required channels satisfies setup');

        // Enabling a feed without a channel must block completion again.
        await config.updateConfig(GUILD_ID, { shop_enabled: true });
        current = await config.getConfig(GUILD_ID);
        assert.ok(config.missingRequirements(current, 2).includes('Item shop channel'));
        await config.updateConfig(GUILD_ID, { shop_channel_id: 'chan-shop' });
        current = await config.getConfig(GUILD_ID);
        assert.deepEqual(config.missingRequirements(current, 2), []);
        record('enabling the item shop demands a channel for it');

        await config.updateConfig(GUILD_ID, { setup_completed: true });
        assert.equal(await config.isSetupCompleted(GUILD_ID), true);
        record('setup completes and unlocks the full command set');

        // --- Teams ----------------------------------------------------------
        const [alpha, bravo] = await teamStore.getTeams(GUILD_ID);

        const first = await teamStore.joinTeam(GUILD_ID, 'player-1', alpha.id);
        assert.equal(first.created, true);
        record('a player can join a team');

        // Two simultaneous clicks must not produce two memberships. pg-mem reports a
        // RETURNING row for both inserts where real Postgres reports one, so the stored
        // state is asserted rather than the `created` flag.
        await Promise.all([
            teamStore.joinTeam(GUILD_ID, 'player-2', alpha.id),
            teamStore.joinTeam(GUILD_ID, 'player-2', bravo.id),
        ]);
        const rows = await db.query('SELECT team_id FROM team_members WHERE guild_id = $1 AND user_id = $2', [
            GUILD_ID,
            'player-2',
        ]);
        assert.equal(rows.rows.length, 1, 'a player may only hold one membership');
        record('concurrent team joins leave exactly one membership');

        const blocked = await teamStore.joinTeam(GUILD_ID, 'player-1', bravo.id);
        assert.equal(String(blocked.membership.team_id), String(alpha.id), 'the original team must survive');
        record('a team choice is permanent while switching is disabled');

        await teamStore.switchTeam(GUILD_ID, 'player-1', bravo.id);
        assert.equal(String((await teamStore.getMembership(GUILD_ID, 'player-1')).team_id), String(bravo.id));
        await teamStore.switchTeam(GUILD_ID, 'player-1', alpha.id);
        record('an admin can move a player to another team');

        // --- Tournament -----------------------------------------------------
        const tournament = await tournamentStore.createTournament({
            guildId: GUILD_ID,
            name: 'Smoke Cup',
            description: 'Integration test',
            createdBy: 'admin-1',
            regions: ['EU', 'NAE'],
        });
        assert.equal(tournament.status, 'draft');
        record('a tournament is created as a draft');

        assert.equal(await tournamentStore.getActiveTournament(GUILD_ID), null);
        await tournamentStore.setTournamentStatus(GUILD_ID, tournament.id, 'open');
        assert.equal((await tournamentStore.getActiveTournament(GUILD_ID)).id, tournament.id);
        record('only an open tournament counts as active');

        const regions = await tournamentStore.getRegions(tournament.id);
        assert.deepEqual(regions.map((r) => r.region).sort(), ['EU', 'NAE']);
        assert.equal(regions[0].creator_code, null);
        record('regions exist with no creator code yet');

        await tournamentStore.setCreatorCode(tournament.id, 'EU', '1234-5678-9012', 'Join at 20:00 CET');
        const withCode = (await tournamentStore.getRegions(tournament.id)).find((r) => r.region === 'EU');
        assert.equal(withCode.creator_code, '1234-5678-9012');
        record('a creator code can be posted per region');

        await tournamentStore.register({
            tournamentId: tournament.id,
            guildId: GUILD_ID,
            userId: 'player-1',
            epicName: 'AlphaMain',
            region: 'EU',
            teamId: alpha.id,
        });
        await tournamentStore.register({
            tournamentId: tournament.id,
            guildId: GUILD_ID,
            userId: 'player-2',
            epicName: 'BravoMain',
            region: 'NAE',
            teamId: bravo.id,
        });
        assert.equal(await tournamentStore.countRegistrations(tournament.id), 2);
        record('players register with an Epic name and a region');

        // Re-registering updates rather than duplicating.
        await tournamentStore.register({
            tournamentId: tournament.id,
            guildId: GUILD_ID,
            userId: 'player-1',
            epicName: 'AlphaRenamed',
            region: 'EU',
            teamId: alpha.id,
        });
        assert.equal(await tournamentStore.countRegistrations(tournament.id), 2, 'no duplicate registration');
        assert.equal((await tournamentStore.getRegistration(tournament.id, 'player-1')).epic_name, 'AlphaRenamed');
        record('re-registering updates the existing entry instead of duplicating');

        const euOnly = await tournamentStore.getRegistrations(tournament.id, 'EU');
        assert.equal(euOnly.length, 1, 'only EU players are returned');
        assert.equal(euOnly[0].user_id, 'player-1');
        record('registrations can be filtered per region for code pings');

        const byName = await tournamentStore.findRegistrationByEpicName(tournament.id, 'bravomain');
        assert.equal(byName.user_id, 'player-2', 'the lookup must ignore case');
        record('an AI-read Epic name maps back to a player, case-insensitively');

        // --- Submissions ----------------------------------------------------
        const submission = await submissionStore.createSubmission({
            guildId: GUILD_ID,
            tournamentId: tournament.id,
            userId: 'player-1',
            teamId: alpha.id,
            region: 'EU',
            epicName: 'AlphaRenamed',
            submittedBy: 'player-1',
            kills: 7,
            claimedVictory: true,
            screenshotHash: 'hash-unique-1',
            screenshotData: Buffer.from('img'),
            screenshotMime: 'image/png',
            aiStatus: 'verified',
            aiConfidence: 0.995,
            aiNote: 'Victory banner visible.',
            aiPredictedKills: 7,
            aiPredictedVictory: true,
            aiPredictedEpicName: 'AlphaRenamed',
        });
        assert.equal(submission.status, 'pending');
        record('a submission lands pending even when the AI is confident');

        assert.equal((await getTeamStandings(GUILD_ID))[0].points, 0);
        record('a pending submission scores nothing');

        // The same image must never be accepted twice, by anyone.
        await assert.rejects(
            () =>
                submissionStore.createSubmission({
                    guildId: GUILD_ID,
                    tournamentId: tournament.id,
                    userId: 'player-2',
                    teamId: bravo.id,
                    region: 'NAE',
                    epicName: 'BravoMain',
                    submittedBy: 'player-2',
                    kills: 3,
                    claimedVictory: false,
                    screenshotHash: 'hash-unique-1',
                    aiStatus: 'manual_review',
                }),
            /duplicate|unique/i,
            'a reused screenshot must be rejected',
        );
        record('the same screenshot cannot be submitted twice, even by another player');

        // --- Approval and scoring -------------------------------------------
        await submissionStore.approveSubmission(GUILD_ID, submission.id, 'admin-1', {
            kills: 7,
            victory: true,
            note: null,
            teamId: alpha.id,
        });

        let standings = await getTeamStandings(GUILD_ID);
        const alphaRow = standings.find((row) => String(row.team_id) === String(alpha.id));
        assert.equal(alphaRow.points, 17, '7 kills + 10 win bonus');
        assert.equal(alphaRow.wins, 1);
        record('approving awards 17 points (7 kills + 10 win bonus)');

        const approved = await submissionStore.getSubmission(GUILD_ID, submission.id);
        assert.equal(approved.ai_corrected, false, 'agreeing with the AI is not a correction');
        record('approving the AI values verbatim is not logged as a correction');

        const scoredAt = approved.scored_at;
        await submissionStore.approveSubmission(GUILD_ID, submission.id, 'admin-1', {
            kills: 5,
            victory: true,
            note: 'Recounted.',
            teamId: alpha.id,
        });
        const edited = await submissionStore.getSubmission(GUILD_ID, submission.id);
        assert.equal(edited.approved_kills, 5);
        assert.equal(edited.ai_corrected, true, 'changing the kill count is a correction');
        assert.deepEqual(edited.scored_at, scoredAt, 'the original scoring time must survive an edit');
        record('editing an approval records the correction and preserves scored_at');

        standings = await getTeamStandings(GUILD_ID);
        assert.equal(standings.find((r) => String(r.team_id) === String(alpha.id)).points, 15);
        record('the corrected kill count is reflected in the standings');

        const players = await getPlayerStandings(GUILD_ID, tournament.id);
        assert.equal(players[0].user_id, 'player-1');
        assert.equal(players[0].points, 15);
        record('per-tournament player standings are correct');

        // pg-mem ignores aggregate FILTER clauses, so the per-status columns it returns are
        // wrong here even though the query is valid Postgres (see validate-sql). Only the
        // unfiltered total is trustworthy under the in-memory driver.
        const summary = await getTournamentSummary(GUILD_ID, tournament.id);
        assert.equal(summary.submissions, 1);
        record('the tournament summary counts the submission (FILTER columns need real Postgres)');

        // --- Custom scoring -------------------------------------------------
        await config.updateConfig(GUILD_ID, { points_per_kill: 2, points_per_win: 25 });
        standings = await getTeamStandings(GUILD_ID);
        assert.equal(standings.find((r) => String(r.team_id) === String(alpha.id)).points, 35, '5*2 + 25');
        record('custom points per kill and per win are applied');

        await config.updateConfig(GUILD_ID, { points_per_kill: 1, points_per_win: 10 });

        // --- Removal --------------------------------------------------------
        await submissionStore.removeSubmission(GUILD_ID, submission.id, 'admin-1', 'Cheating.');
        standings = await getTeamStandings(GUILD_ID);
        assert.equal(standings.find((r) => String(r.team_id) === String(alpha.id)).points, 0);
        record('removing a submission takes its points back immediately');

        const reApproved = await submissionStore.approveSubmission(GUILD_ID, submission.id, 'admin-1', {
            kills: 5,
            victory: true,
            note: null,
            teamId: alpha.id,
        });
        assert.equal(reApproved, null, 'a removed submission is terminal');
        record('a removed submission can never be approved again');

        console.log(`\n${checks.length} flow checks passed.\n`);
    } catch (error) {
        console.error(`\n✗ FAILED: ${error.message}\n`);
        if (error.stack) console.error(error.stack.split('\n').slice(1, 5).join('\n'));
        process.exitCode = 1;
    } finally {
        if (db.pool) await db.pool.end().catch(() => {});
    }
})();
