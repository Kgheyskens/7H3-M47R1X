const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

const { CLASSES, CLASS_ORDER } = require('./valorantData');
const { getRoles } = require('./selfRoles');

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
                ranks.length ? `**Rank** — ${ranks.map((rank) => rank.label).join(', ')}` : '_No ranks configured yet._',
            ].join('\n'),
        );

    const components = [];

    if (ranks.length) {
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('roles:rank')
                    .setPlaceholder('Select your rank')
                    .setMinValues(0)
                    .setMaxValues(1)
                    .addOptions(
                        ranks.map((rank) => ({
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
        embed.addFields({ name: `${meta.emoji} ${meta.label}`, value: inClass.map((agent) => agent.label).join(', ') });

        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`roles:agent:${key}`)
                    .setPlaceholder(`Agents you main — ${meta.label}`)
                    .setMinValues(0)
                    .setMaxValues(inClass.length)
                    .addOptions(inClass.map((agent) => ({ label: agent.label, value: agent.role_id }))),
            ),
        );
    }

    return { embeds: [embed], components: components.slice(0, 5) };
}

module.exports = { rolesPanelPayload, rulesPayload };
