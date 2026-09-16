const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { chunkText } = require('./text');

// An embed description caps at 4096 characters, but a single message can carry up to 10
// embeds — so a long rules text is split across multiple embeds in one message instead of
// being rejected or truncated.
const EMBED_DESCRIPTION_LIMIT = 4000;
const MAX_EMBEDS_PER_MESSAGE = 10;

function rulesPayload(config) {
    const text = config.rules_message || '_No rules have been set yet._';
    const chunks = chunkText(text, EMBED_DESCRIPTION_LIMIT).slice(0, MAX_EMBEDS_PER_MESSAGE);

    const embeds = chunks.map((chunk, index) => {
        const embed = new EmbedBuilder().setColor(0xff4655).setDescription(chunk);
        if (index === 0) embed.setTitle('📜 Server rules');
        return embed;
    });

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

    return { embeds, components };
}

module.exports = { rulesPayload };
