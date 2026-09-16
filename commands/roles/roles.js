const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const { getConfig } = require('../../utils/configStore');
const { getAllRoles } = require('../../utils/selfRoles');
const { CLASSES } = require('../../utils/valorantData');

async function handleAcceptRules(interaction) {
    const config = await getConfig(interaction.guildId);

    if (!config.rules_accept_enabled || !config.rules_accept_role_id) {
        await interaction.reply({ content: 'There is nothing to accept right now.', ephemeral: true });
        return;
    }

    if (interaction.member.roles.cache.has(config.rules_accept_role_id)) {
        await interaction.reply({ content: 'You have already accepted the rules. 👍', ephemeral: true });
        return;
    }

    await interaction.member.roles.add(config.rules_accept_role_id, 'Accepted the server rules');
    await interaction.reply({ content: '✅ Thanks — you now have full access to the server. GLHF!', ephemeral: true });
}

async function handleRankSelect(interaction) {
    const ranks = await getAllRoles(interaction.guildId).then((rows) => rows.filter((row) => row.category === 'rank'));
    const rankRoleIds = ranks.map((rank) => rank.role_id);
    const [selected] = interaction.values;

    const toRemove = rankRoleIds.filter((id) => id !== selected && interaction.member.roles.cache.has(id));
    if (toRemove.length) await interaction.member.roles.remove(toRemove).catch(() => {});
    if (selected) await interaction.member.roles.add(selected).catch(() => {});

    const label = ranks.find((rank) => rank.role_id === selected)?.label;
    await interaction.reply({
        content: selected ? `🏆 Rank set to **${label}**. Climb the ladder!` : 'Rank cleared.',
        ephemeral: true,
    });
}

async function handleAgentSelect(interaction, classKey) {
    const agents = await getAllRoles(interaction.guildId).then((rows) =>
        rows.filter((row) => row.category === 'agent' && row.group_name === classKey),
    );
    const classRoleIds = agents.map((agent) => agent.role_id);
    const selected = new Set(interaction.values);

    const toAdd = [...selected].filter((id) => !interaction.member.roles.cache.has(id));
    const toRemove = classRoleIds.filter((id) => !selected.has(id) && interaction.member.roles.cache.has(id));

    if (toAdd.length) await interaction.member.roles.add(toAdd).catch(() => {});
    if (toRemove.length) await interaction.member.roles.remove(toRemove).catch(() => {});

    const meta = CLASSES[classKey];
    const labels = agents.filter((agent) => selected.has(agent.role_id)).map((agent) => agent.label);
    await interaction.reply({
        content: labels.length
            ? `${meta.emoji} ${meta.label} agents updated: **${labels.join(', ')}**`
            : `${meta.emoji} No ${meta.label} agents selected.`,
        ephemeral: true,
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roles')
        .setDescription('View the rank and agent roles you currently have.')
        .setDMPermission(false),

    async execute(interaction) {
        const allRoles = await getAllRoles(interaction.guildId);
        const mine = allRoles.filter((row) => interaction.member.roles.cache.has(row.role_id));

        const rank = mine.find((row) => row.category === 'rank');
        const agents = mine.filter((row) => row.category === 'agent');

        const embed = new EmbedBuilder()
            .setColor(0xff4655)
            .setTitle(`${interaction.user.username}'s Valorant profile`)
            .addFields(
                { name: 'Rank', value: rank ? rank.label : '_not set_' },
                { name: 'Agent pool', value: agents.length ? agents.map((agent) => agent.label).join(', ') : '_none picked yet_' },
            )
            .setFooter({ text: 'Use the role panel to change these.' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleButton(interaction) {
        const [, action] = interaction.customId.split(':');
        if (action === 'acceptrules') await handleAcceptRules(interaction);
    },

    async handleSelectMenu(interaction) {
        const [, action, argument] = interaction.customId.split(':');
        if (action === 'rank') await handleRankSelect(interaction);
        else if (action === 'agent') await handleAgentSelect(interaction, argument);
    },
};
