const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const { CLASSES, DEFAULT_AGENTS } = require('../../utils/valorantData');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('agent')
        .setDescription("Can't decide who to lock in? Get a random agent suggestion.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName('class')
                .setDescription('Limit the roulette to one agent class.')
                .addChoices(...Object.entries(CLASSES).map(([value, meta]) => ({ name: meta.label, value }))),
        ),

    async execute(interaction) {
        const classKey = interaction.options.getString('class');
        const pool = classKey ? DEFAULT_AGENTS.filter((agent) => agent.group === classKey) : DEFAULT_AGENTS;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const meta = CLASSES[pick.group];

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(pick.color)
                    .setTitle('🎲 Lock in:')
                    .setDescription(`**${pick.label}** — ${meta.emoji} ${meta.label}`),
            ],
        });
    },
};
