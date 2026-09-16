const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

const { query } = require('./db');
const { getRoles } = require('./selfRoles');
const { boundedJoin } = require('./text');
const { CLASSES, CLASS_ORDER } = require('./valorantData');

const MAX_SELECT_OPTIONS = 25;

function rankPayload(ranks) {
    const options = ranks.slice(0, MAX_SELECT_OPTIONS);

    return {
        embeds: [
            new EmbedBuilder()
                .setColor(0xff4655)
                .setTitle('🏆 Select your rank')
                .setDescription(
                    `Pick the rank that matches your current competitive rank. You can change this any time.\n\n${boundedJoin(ranks.map((rank) => rank.label))}`,
                ),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('roles:rank')
                    .setPlaceholder('Select your rank')
                    .setMinValues(0)
                    .setMaxValues(1)
                    .addOptions(
                        options.map((rank) => ({
                            label: rank.label,
                            value: rank.role_id,
                            emoji: rank.emoji || undefined,
                        })),
                    ),
            ),
        ],
    };
}

function agentClassPayload(classKey, agents) {
    const meta = CLASSES[classKey];
    const options = agents.slice(0, MAX_SELECT_OPTIONS);

    return {
        embeds: [
            new EmbedBuilder()
                .setColor(0xff4655)
                .setTitle(`${meta.emoji} ${meta.label} agents`)
                .setDescription(
                    `Pick every ${meta.label} you main. You can choose more than one, and change these any time.\n\n${boundedJoin(agents.map((agent) => agent.label), 900)}`,
                ),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`roles:agent:${classKey}`)
                    .setPlaceholder(`Agents you main — ${meta.label}`)
                    .setMinValues(0)
                    .setMaxValues(options.length)
                    .addOptions(options.map((agent) => ({ label: agent.label, value: agent.role_id }))),
            ),
        ],
    };
}

/** One panel per rank + per agent class that actually has roles, each its own message. */
async function listPanels(guildId) {
    const [ranks, agents] = await Promise.all([getRoles(guildId, 'rank'), getRoles(guildId, 'agent')]);
    const panels = [];

    if (ranks.length) panels.push({ key: 'rank', payload: rankPayload(ranks) });

    for (const key of CLASS_ORDER) {
        const inClass = agents.filter((agent) => agent.group_name === key);
        if (inClass.length) panels.push({ key: `agent:${key}`, payload: agentClassPayload(key, inClass) });
    }

    return panels;
}

async function getMessageIds(guildId) {
    const result = await query('SELECT panel_key, message_id FROM role_panel_messages WHERE guild_id = $1', [guildId]);
    return Object.fromEntries(result.rows.map((row) => [row.panel_key, row.message_id]));
}

async function setMessageId(guildId, panelKey, messageId) {
    await query(
        `INSERT INTO role_panel_messages (guild_id, panel_key, message_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, panel_key) DO UPDATE SET message_id = EXCLUDED.message_id, updated_at = NOW()`,
        [guildId, panelKey, messageId],
    );
}

/**
 * Posts (or edits in place) one message per panel in the channel — a rank one and one per
 * agent class — instead of cramming every select menu into a single message.
 */
async function postPanels(guild, channel) {
    const panels = await listPanels(guild.id);
    const existingIds = await getMessageIds(guild.id);
    const postedKeys = [];

    for (const panel of panels) {
        const existingId = existingIds[panel.key];
        const existing = existingId ? await channel.messages.fetch(existingId).catch(() => null) : null;
        const message = existing ? await existing.edit(panel.payload) : await channel.send(panel.payload);
        await setMessageId(guild.id, panel.key, message.id);
        postedKeys.push(panel.key);
    }

    return postedKeys;
}

module.exports = { listPanels, postPanels };
