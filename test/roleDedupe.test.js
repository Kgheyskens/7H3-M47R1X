const test = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');

process.env.DATABASE_URL = 'postgres://test/dedupe';

const memory = newDb();
const adapter = memory.adapters.createPg();
require.cache[require.resolve('pg')] = { id: 'pg', filename: 'pg', loaded: true, exports: adapter };

const db = require('../utils/db');
const selfRoles = require('../utils/selfRoles');
const { dedupeGuildRoles } = require('../utils/roleDedupe');

function fakeGuild(id, roleMembers) {
    const roles = new Map();
    for (const [roleId, memberIds] of Object.entries(roleMembers)) {
        roles.set(roleId, {
            id: roleId,
            members: new Map(memberIds.map((userId) => [userId, { id: userId, roles: { cache: new Set(), add: async () => {} } }])),
            delete: async () => roles.delete(roleId),
        });
    }
    return { id, roles: { fetch: async (roleId) => roles.get(roleId) || null } };
}

test('a double-click race that creates two roles with the same label is merged back to one', async () => {
    await db.requireDatabase();
    const GUILD_ID = 'dedupe-guild-1';

    await selfRoles.addRole(GUILD_ID, { category: 'rank', roleId: 'role-gold-a', label: 'Gold' });
    await selfRoles.addRole(GUILD_ID, { category: 'rank', roleId: 'role-gold-b', label: 'Gold' });
    await selfRoles.addRole(GUILD_ID, { category: 'rank', roleId: 'role-diamond', label: 'Diamond' });

    const guild = fakeGuild(GUILD_ID, { 'role-gold-a': [], 'role-gold-b': ['user-1'], 'role-diamond': [] });
    const result = await dedupeGuildRoles(guild);

    assert.equal(result.rolesRemoved, 1);
    assert.equal(result.membersMigrated, 1, 'the member on the duplicate role must be moved onto the survivor');
    assert.deepEqual(result.labels, ['Gold']);

    const ranks = await selfRoles.getRoles(GUILD_ID, 'rank');
    assert.equal(ranks.length, 2, 'Gold should be a single row now, Diamond untouched');
    assert.equal(ranks.find((r) => r.label === 'Gold').role_id, 'role-gold-a', 'the oldest row survives');
});

test('a roster with no duplicates is left untouched', async () => {
    await db.requireDatabase();
    const GUILD_ID = 'dedupe-guild-2';

    await selfRoles.addRole(GUILD_ID, { category: 'agent', roleId: 'role-jett', label: 'Jett', group: 'duelist' });
    const guild = fakeGuild(GUILD_ID, { 'role-jett': [] });

    const result = await dedupeGuildRoles(guild);
    assert.deepEqual(result, { rolesRemoved: 0, membersMigrated: 0, labels: [] });
});

test.after(async () => {
    if (db.pool) await db.pool.end().catch(() => {});
});
