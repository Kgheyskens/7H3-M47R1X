const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

const { CLASSES, CLASS_ORDER } = require('./valorantData');
const { getRoles } = require('./selfRoles');

// Discord select menus cap out at 25 options and embed field values at 1024 characters —
// this keeps both panel and admin-overview text within those limits even if a server ends
// up with an unusually long rank/agent list (duplicates, or just a lot of custom ranks).
const MAX_SELECT_OPTIONS = 25;

function boundedJoin(labels, limit = 1000) {
    let result = '';
    let shown = 0;

    for (const label of labels) {
        const next = result ? `${result}, ${label}` : label;
        if (next.length > limit) break;
        result = next;
        shown += 1;
    }

    const remaining = labels.length - shown;
    return remaining > 0 ? `${result}, …and ${remaining} more` : result;
}

function rulesPayload(config) {
    const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('📜 Server rules')
        .setDescription(config.rules_message || '_No rules have been set yet._');

    const components = [];
    if (config.rules_accept_enabled) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('roles:acceptrules')
                    .setLabel('I agree to the rules')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
            ),
        );
    }

    return { embeds: [embed], components };
}

async function rolesPanelPayload(guildId) {
    const [ranks, agents] = await Promise.all([getRoles(guildId, 'rank'), getRoles(guildId, 'agent')]);

    const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('🎮 Ranks & agents')
        .setDescription(
            [
                'Pick your competitive rank and every agent you main. You can change these any time.',
                '',
                ranks.length ? `**Rank** — ${boundedJoin(ranks.map((rank) => rank.label))}` : '_No ranks configured yet._',
            ].join('\n'),
        );

    const components = [];

    if (ranks.length) {
        const options = ranks.slice(0, MAX_SELECT_OPTIONS);
        components.push(
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
        );
    }

    for (const key of CLASS_ORDER) {
        const inClass = agents.filter((agent) => agent.group_name === key);
        if (!inClass.length) continue;

        const meta = CLASSES[key];
        embed.addFields({ name: `${meta.emoji} ${meta.label}`, value: boundedJoin(inClass.map((agent) => agent.label), 220) });

        const options = inClass.slice(0, MAX_SELECT_OPTIONS);
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`roles:agent:${key}`)
                    .setPlaceholder(`Agents you main — ${meta.label}`)
                    .setMinValues(0)
                    .setMaxValues(options.length)
                    .addOptions(options.map((agent) => ({ label: agent.label, value: agent.role_id }))),
            ),
        );
    }

    return { embeds: [embed], components: components.slice(0, 5) };
}

module.exports = { boundedJoin, rolesPanelPayload, rulesPayload };
