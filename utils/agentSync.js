const { getConfig, updateConfig } = require('./configStore');
const { rolesPanelPayload } = require('./panelRender');
const selfRoles = require('./selfRoles');
const { getAgentRoster } = require('./valorantApi');

/**
 * Creates a role for any agent in the live roster that this guild does not already have,
 * then refreshes the posted role panel (edited in place) and drops a short heads-up in that
 * channel. A guild that has never used agent roles (no rows yet) is left alone — this only
 * keeps an existing roster in sync, it does not opt guilds in.
 */
async function syncAgents(guild) {
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
}

async function announceNewAgents(guild, added) {
    const config = await getConfig(guild.id);
    if (!config.roles_panel_channel_id) return;

    const channel = await guild.channels.fetch(config.roles_panel_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    const payload = await rolesPanelPayload(guild.id);
    const existingMessage = config.roles_panel_message_id
        ? await channel.messages.fetch(config.roles_panel_message_id).catch(() => null)
        : null;
    const message = existingMessage ? await existingMessage.edit(payload) : await channel.send(payload);
    await updateConfig(guild.id, { roles_panel_message_id: message.id });

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
