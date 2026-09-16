const selfRoles = require('./selfRoles');

/**
 * A race between two clicks of the same bulk-create button inserts two self_roles rows
 * with the same label (each pointing at a different, genuinely separate Discord role) —
 * that is what "double roles" looks like. This merges each such group back down to one:
 * the oldest row survives, members who only have a duplicate are moved onto it, and the
 * duplicate roles are deleted from Discord.
 */
async function dedupeGuildRoles(guild) {
    const rows = await selfRoles.getAllRoles(guild.id);

    const groups = new Map();
    for (const row of rows) {
        const key = `${row.category}:${row.label.toLowerCase()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    let rolesRemoved = 0;
    let membersMigrated = 0;
    const labels = [];

    for (const group of groups.values()) {
        if (group.length < 2) continue;
        group.sort((a, b) => a.id - b.id);
        const [survivor, ...duplicates] = group;
        labels.push(survivor.label);

        for (const duplicate of duplicates) {
            const role = await guild.roles.fetch(duplicate.role_id).catch(() => null);

            if (role) {
                for (const member of role.members.values()) {
                    if (!member.roles.cache.has(survivor.role_id)) {
                        await member.roles.add(survivor.role_id).catch(() => {});
                        membersMigrated += 1;
                    }
                }
                await role.delete('Merged duplicate self-assign role').catch(() => {});
            }

            await selfRoles.removeRole(guild.id, duplicate.role_id);
            rolesRemoved += 1;
        }
    }

    return { rolesRemoved, membersMigrated, labels };
}

module.exports = { dedupeGuildRoles };
