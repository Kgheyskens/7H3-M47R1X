const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const selfRoles = require('../../utils/selfRoles');
const { CLASSES } = require('../../utils/valorantData');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('agent')
        .setDescription("Can't decide who to lock in? Get a random suggestion from the agents you main.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName('class')
                .setDescription('Limit the roulette to one agent class.')
                .addChoices(...Object.entries(CLASSES).map(([value, meta]) => ({ name: meta.label, value }))),
        ),

    async execute(interaction) {
        const classKey = interaction.options.getString('class');
        const agents = await selfRoles.getRoles(interaction.guildId, 'agent');
        const mine = agents.filter(
            (agent) => interaction.member.roles.cache.has(agent.role_id) && (!classKey || agent.group_name === classKey),
        );

        if (!mine.length) {
            const scope = classKey ? `${CLASSES[classKey].label} ` : '';
            await interaction.reply({
                content: `You haven't picked any ${scope}agents yet — grab some from the role panel first, then try again.`,
                ephemeral: true,
            });
            return;
        }

        const pick = mine[Math.floor(Math.random() * mine.length)];
        const meta = CLASSES[pick.group_name];

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xff4655)
                    .setTitle('🎲 Lock in:')
                    .setDescription(`**${pick.label}** — ${meta.emoji} ${meta.label}`),
            ],
        });
    },
};
