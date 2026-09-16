const { acquireLock, releaseLock } = require('./actionLock');
const { getConfig } = require('./configStore');
const rolePanel = require('./rolePanel');
const selfRoles = require('./selfRoles');
const { getAgentRoster } = require('./valorantApi');

function rolesLockKey(guildId) {
    return `roles:${guildId}`;
}

/**
 * Creates a role for any agent in the live roster that this guild does not already have,
 * then refreshes the posted role panel (edited in place) and drops a short heads-up in that
 * channel. A guild that has never used agent roles (no rows yet) is left alone — this only
 * keeps an existing roster in sync, it does not opt guilds in.
 *
 * Shares its lock key with the setup wizard's bulk role actions (rankdefaults, agentdefaults,
 * dedupe) so the scheduled sync and a manual click in `/setup` can never mutate the same
 * guild's roles at the same time.
 */
async function syncAgents(guild) {
    const lockKey = rolesLockKey(guild.id);
    if (!acquireLock(lockKey)) return { added: [], locked: true };

    try {
        const existing = await selfRoles.getRoles(guild.id, 'agent');
        if (!existing.length) return { added: [] };

        const existingLabels = new Set(existing.map((agent) => agent.label.toLowerCase()));
        const roster = await getAgentRoster();
        const missing = roster.filter((agent) => !existingLabels.has(agent.label.toLowerCase()));
        if (!missing.length) return { added: [] };

        const added = [];
        for (const agent of missing) {
            try {
                const role = await guild.roles.create({
                    name: agent.label,
                    color: agent.color ?? undefined,
                    hoist: false,
                    mentionable: false,
                    reason: 'New Valorant agent auto-added',
                });
                await selfRoles.addRole(guild.id, { category: 'agent', roleId: role.id, label: agent.label, group: agent.group });
                added.push(agent.label);
            } catch (error) {
                console.error(`Could not create a role for new agent ${agent.label} in guild ${guild.id}:`, error.message);
            }
        }

        if (added.length) await announceNewAgents(guild, added);
        return { added };
    } finally {
        releaseLock(lockKey);
    }
}

async function announceNewAgents(guild, added) {
    const config = await getConfig(guild.id);
    if (!config.roles_panel_channel_id) return;

    const channel = await guild.channels.fetch(config.roles_panel_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    await rolePanel.postPanels(guild, channel);

    await channel
        .send(`🆕 New agent${added.length > 1 ? 's' : ''} added to the roster: **${added.join(', ')}** — pick ${added.length > 1 ? 'them' : 'it'} up above!`)
        .catch(() => {});
}

async function syncAllGuilds(client) {
    const guildIds = await selfRoles.getGuildsWithCategory('agent');
    for (const guildId of guildIds) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        await syncAgents(guild).catch((error) => console.error(`Agent sync failed for guild ${guildId}:`, error.message));
    }
}

module.exports = { syncAgents, syncAllGuilds };
