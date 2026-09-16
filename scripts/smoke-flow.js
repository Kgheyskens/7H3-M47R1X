/**
 * Walks the whole setup flow against an in-memory Postgres: config defaults, welcome/goodbye
 * settings, rules, and self-assign rank/agent roles.
 *
 * Run with: npm run smoke
 */
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');

process.env.DATABASE_URL = 'postgres://smoke/flow';

const GUILD_ID = '1091387805550260224';

const memory = newDb();
const adapter = memory.adapters.createPg();
require.cache[require.resolve('pg')] = { id: 'pg', filename: 'pg', loaded: true, exports: adapter };

const db = require('../utils/db');
const config = require('../utils/configStore');
const selfRoles = require('../utils/selfRoles');

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

        // --- Welcome / goodbye / rules ---------------------------------------
        await config.updateConfig(GUILD_ID, {
            welcome_enabled: true,
            welcome_channel_id: 'chan-welcome',
            rules_channel_id: 'chan-rules',
            rules_message: 'Be respectful.',
            rules_accept_enabled: true,
            rules_accept_role_id: 'role-verified',
        });

        let current = await config.getConfig(GUILD_ID);
        assert.equal(current.welcome_enabled, true);
        assert.equal(current.rules_accept_role_id, 'role-verified');
        record('welcome, goodbye and rules settings persist');

        // --- Ranks ------------------------------------------------------------
        await selfRoles.addRole(GUILD_ID, { category: 'rank', roleId: 'role-gold', label: 'Gold' });
        await selfRoles.addRole(GUILD_ID, { category: 'rank', roleId: 'role-diamond', label: 'Diamond' });
        const ranks = await selfRoles.getRoles(GUILD_ID, 'rank');
        assert.equal(ranks.length, 2);
        assert.deepEqual(ranks.map((rank) => rank.label), ['Gold', 'Diamond']);
        record('ranks can be added and are listed in creation order');

        await selfRoles.removeRole(GUILD_ID, 'role-gold');
        assert.equal((await selfRoles.getRoles(GUILD_ID, 'rank')).length, 1);
        record('a rank can be removed on its own, so the ladder can change over time');

        // --- Agents -------------------------------------------------------------
        await selfRoles.addRole(GUILD_ID, { category: 'agent', roleId: 'role-jett', label: 'Jett', group: 'duelist' });
        await selfRoles.addRole(GUILD_ID, { category: 'agent', roleId: 'role-sova', label: 'Sova', group: 'initiator' });
        const agents = await selfRoles.getRoles(GUILD_ID, 'agent');
        assert.equal(agents.length, 2);
        assert.equal(agents.find((agent) => agent.label === 'Jett').group_name, 'duelist');
        record('agents keep their class grouping');

        const all = await selfRoles.getAllRoles(GUILD_ID);
        assert.equal(all.length, 3, 'ranks and agents share one table but stay distinguishable by category');
        record('getAllRoles returns every self-assignable role across both categories');

        // --- Finish -------------------------------------------------------------
        await config.updateConfig(GUILD_ID, { setup_completed: true });
        assert.equal(await config.isSetupCompleted(GUILD_ID), true);
        record('finishing setup marks the guild as configured');

        console.log(`\n${checks.length} smoke checks passed.\n`);
    } catch (error) {
        console.error(`\n✗ FAILED: ${error.message}\n`);
        if (error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        process.exitCode = 1;
    } finally {
        if (db.pool) await db.pool.end().catch(() => {});
    }
})();
