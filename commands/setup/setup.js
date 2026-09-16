const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');

const { acquireLock, releaseLock } = require('../../utils/actionLock');
const { deployGuildCommands } = require('../../deploy/deployCommands');
const { syncAgents } = require('../../utils/agentSync');
const { ensureConfig, getConfig, updateConfig } = require('../../utils/configStore');
const { rulesPayload } = require('../../utils/panelRender');
const rolePanel = require('../../utils/rolePanel');
const { dedupeGuildRoles } = require('../../utils/roleDedupe');
const selfRoles = require('../../utils/selfRoles');
const { boundedJoin, truncate } = require('../../utils/text');
const { CLASS_ORDER, CLASSES, DEFAULT_RANKS } = require('../../utils/valorantData');
const { getAgentRoster } = require('../../utils/valorantApi');
const { DEFAULT_GOODBYE, DEFAULT_WELCOME } = require('../../utils/welcomeGoodbye');

const RULES_PART_LIMIT = 4000;

function rolesLockKey(guildId) {
    return `roles:${guildId}`;
}

const CHANNEL_FIELDS = {
    welcome: { column: 'welcome_channel_id', label: 'Welcome channel' },
    goodbye: { column: 'goodbye_channel_id', label: 'Goodbye channel' },
    rules: { column: 'rules_channel_id', label: 'Rules channel' },
    rolespanel: { column: 'roles_panel_channel_id', label: 'Roles panel channel' },
    news: { column: 'news_channel_id', label: 'News channel' },
};

function check(value) {
    return value ? '✅' : '⬜';
}

function requireAdministrator(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function respond(interaction, payload) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
    } else if (interaction.isChatInputCommand()) {
        await interaction.reply({ ...payload, ephemeral: true });
    } else {
        await interaction.update(payload);
    }
}

// --- Overview ----------------------------------------------------------------

async function renderOverview(interaction) {
    const config = await getConfig(interaction.guildId);
    const ranks = await selfRoles.getRoles(interaction.guildId, 'rank');
    const agents = await selfRoles.getRoles(interaction.guildId, 'agent');

    const embed = new EmbedBuilder()
        .setColor(config.setup_completed ? 0x57f287 : 0xff4655)
        .setTitle('⚙️ Valorant bot setup')
        .setDescription(
            config.setup_completed
                ? 'Setup is complete. All commands are available. You can change any setting below.'
                : 'Configure what you need, then press **Finish setup** to unlock every command.',
        )
        .addFields(
            {
                name: 'Welcome & goodbye',
                value: [
                    `${check(config.welcome_enabled)} **Welcome** — ${config.welcome_channel_id ? `<#${config.welcome_channel_id}>` : '_no channel_'}`,
                    `${check(config.goodbye_enabled)} **Goodbye** — ${config.goodbye_channel_id ? `<#${config.goodbye_channel_id}>` : '_no channel_'}`,
                ].join('\n'),
            },
            {
                name: 'Rules',
                value: [
                    `${check(config.rules_channel_id)} **Channel** — ${config.rules_channel_id ? `<#${config.rules_channel_id}>` : '_not set_'}`,
                    `${check(config.rules_accept_enabled)} **Accept button** — ${config.rules_accept_role_id ? `grants <@&${config.rules_accept_role_id}>` : '_no role chosen_'}`,
                ].join('\n'),
            },
            {
                name: 'Ranks & agents',
                value: [
                    `${check(ranks.length)} **${ranks.length}** rank role(s)`,
                    `${check(agents.length)} **${agents.length}** agent role(s) — kept in sync with new releases automatically`,
                    `${check(config.roles_panel_channel_id)} **Panel channel** — ${config.roles_panel_channel_id ? `<#${config.roles_panel_channel_id}>` : '_not set_'}`,
                ].join('\n'),
            },
            {
                name: 'News',
                value: [
                    `${check(config.news_enabled)} **Feed** — ${config.news_channel_id ? `<#${config.news_channel_id}>` : '_no channel_'}`,
                    config.news_feed_url ? `_${config.news_feed_url}_` : '_no feed URL set_',
                ].join('\n'),
            },
        );

    const components = [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('setup:menu')
                .setPlaceholder('Choose what to configure')
                .addOptions(
                    { label: 'Welcome message', value: 'welcome', emoji: '👋' },
                    { label: 'Goodbye message', value: 'goodbye', emoji: '🚪' },
                    { label: 'Rules', value: 'rules', emoji: '📜' },
                    { label: 'Ranks & agents', value: 'roles', emoji: '🎮' },
                    { label: 'News feed', value: 'news', emoji: '📰' },
                ),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup:finish')
                .setLabel(config.setup_completed ? 'Re-check and save' : 'Finish setup')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder().setCustomId('setup:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
        ),
    ];

    await respond(interaction, { embeds: [embed], components });
}

// --- Welcome / goodbye ---------------------------------------------------------

function messageSectionEmbed({ title, color, enabled, channelId, message, fallback }) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .addFields(
            { name: `${check(enabled)} Enabled`, value: enabled ? 'Members will see this.' : 'Turned off.' },
            { name: 'Channel', value: channelId ? `<#${channelId}>` : '_not set_' },
            { name: 'Message', value: message || `_using the default:_\n${fallback}` },
        )
        .setFooter({ text: 'Placeholders: {user} {username} {server} {membercount}' });
}

async function renderWelcome(interaction) {
    const config = await getConfig(interaction.guildId);
    const embed = messageSectionEmbed({
        title: '👋 Welcome message',
        color: 0xff4655,
        enabled: config.welcome_enabled,
        channelId: config.welcome_channel_id,
        message: config.welcome_message,
        fallback: DEFAULT_WELCOME,
    });

    await respond(interaction, {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('setup:setchannel:welcome')
                    .setPlaceholder('Select the welcome channel')
                    .addChannelTypes(ChannelType.GuildText),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup:toggle:welcome_enabled')
                    .setLabel(config.welcome_enabled ? 'Disable' : 'Enable')
                    .setStyle(config.welcome_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder().setCustomId('setup:editmsg:welcome').setLabel('Edit message').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function renderGoodbye(interaction) {
    const config = await getConfig(interaction.guildId);
    const embed = messageSectionEmbed({
        title: '🚪 Goodbye message',
        color: 0x2f3136,
        enabled: config.goodbye_enabled,
        channelId: config.goodbye_channel_id,
        message: config.goodbye_message,
        fallback: DEFAULT_GOODBYE,
    });

    await respond(interaction, {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('setup:setchannel:goodbye')
                    .setPlaceholder('Select the goodbye channel')
                    .addChannelTypes(ChannelType.GuildText),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup:toggle:goodbye_enabled')
                    .setLabel(config.goodbye_enabled ? 'Disable' : 'Enable')
                    .setStyle(config.goodbye_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder().setCustomId('setup:editmsg:goodbye').setLabel('Edit message').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

function showMessageModal(interaction, key, { title, label, maxLength, current, placeholder }) {
    return interaction.showModal(
        new ModalBuilder()
            .setCustomId(`setup:msgmodal:${key}`)
            .setTitle(title)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('message')
                        .setLabel(label)
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(maxLength)
                        .setPlaceholder(placeholder)
                        .setValue(current || ''),
                ),
            ),
    );
}

async function handleMessageModal(interaction, key) {
    const message = interaction.fields.getTextInputValue('message').trim();
    const column = `${key}_message`;
    await updateConfig(interaction.guildId, { [column]: message });

    if (key === 'welcome') await renderWelcome(interaction);
    else if (key === 'goodbye') await renderGoodbye(interaction);
}

// --- Rules -----------------------------------------------------------------

/**
 * A modal text input caps at 4000 characters — Discord's own limit, not this bot's — so a
 * long rules document is split across up to 3 fields here and joined back together, giving
 * up to 12000 characters. Display-side, panelRender.js splits it across multiple embeds.
 */
function showRulesModal(interaction, current) {
    const parts = [
        (current || '').slice(0, RULES_PART_LIMIT),
        (current || '').slice(RULES_PART_LIMIT, RULES_PART_LIMIT * 2),
        (current || '').slice(RULES_PART_LIMIT * 2, RULES_PART_LIMIT * 3),
    ];

    return interaction.showModal(
        new ModalBuilder()
            .setCustomId('setup:rulesmodal')
            .setTitle('Rules text')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('part1')
                        .setLabel('Rules')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(RULES_PART_LIMIT)
                        .setPlaceholder('Be respectful. No cheating. Have fun.')
                        .setValue(parts[0]),
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('part2')
                        .setLabel('Rules — continued (optional)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(RULES_PART_LIMIT)
                        .setValue(parts[1]),
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('part3')
                        .setLabel('Rules — continued (optional)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(RULES_PART_LIMIT)
                        .setValue(parts[2]),
                ),
            ),
    );
}

async function handleRulesModal(interaction) {
    const combined = ['part1', 'part2', 'part3']
        .map((id) => interaction.fields.getTextInputValue(id).trim())
        .filter(Boolean)
        .join('\n');

    await updateConfig(interaction.guildId, { rules_message: combined });
    await renderRules(interaction);
}

async function renderRules(interaction) {
    const config = await getConfig(interaction.guildId);
    const rulesLength = config.rules_message?.length || 0;

    const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('📜 Rules')
        .addFields(
            { name: 'Channel', value: config.rules_channel_id ? `<#${config.rules_channel_id}>` : '_not set_' },
            {
                name: `Text (${rulesLength} character${rulesLength === 1 ? '' : 's'})`,
                value: config.rules_message ? truncate(config.rules_message, 1000) : '_not set yet_',
            },
            {
                name: `${check(config.rules_accept_enabled)} Accept button`,
                value: config.rules_accept_role_id
                    ? `Grants <@&${config.rules_accept_role_id}> when a member clicks **I agree**.`
                    : 'Choose a role below to grant when a member accepts.',
            },
        );

    await respond(interaction, {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('setup:setchannel:rules')
                    .setPlaceholder('Select the rules channel')
                    .addChannelTypes(ChannelType.GuildText),
            ),
            new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder().setCustomId('setup:setacceptrole').setPlaceholder('Role granted on accept'),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:editmsg:rules').setLabel('Edit rules text').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup:toggle:rules_accept_enabled')
                    .setLabel(config.rules_accept_enabled ? 'Disable accept button' : 'Enable accept button')
                    .setStyle(config.rules_accept_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup:postrules')
                    .setLabel('Post rules message')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📤')
                    .setDisabled(!config.rules_channel_id),
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function postRules(interaction) {
    await interaction.deferUpdate();
    const config = await getConfig(interaction.guildId);

    if (!config.rules_channel_id) {
        await renderRules(interaction);
        return;
    }

    const channel = await interaction.guild.channels.fetch(config.rules_channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
        await renderRules(interaction);
        return;
    }

    const payload = rulesPayload(config);
    const existing = config.rules_message_id ? await channel.messages.fetch(config.rules_message_id).catch(() => null) : null;
    const message = existing ? await existing.edit(payload) : await channel.send(payload);

    await updateConfig(interaction.guildId, { rules_message_id: message.id });
    await renderRules(interaction);
}

// --- News --------------------------------------------------------------------

async function renderNews(interaction) {
    const config = await getConfig(interaction.guildId);

    const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('📰 News feed')
        .setDescription('Posts new articles from any RSS or Atom feed — official Valorant news, a fan site, whatever you point it at.')
        .addFields(
            { name: `${check(config.news_enabled)} Enabled`, value: config.news_enabled ? 'Checked every 15 minutes.' : 'Turned off.' },
            { name: 'Channel', value: config.news_channel_id ? `<#${config.news_channel_id}>` : '_not set_' },
            { name: 'Feed URL', value: config.news_feed_url ? config.news_feed_url : '_not set_' },
            { name: 'Ping role', value: config.news_mention_role_id ? `<@&${config.news_mention_role_id}>` : '_none_' },
        );

    await respond(interaction, {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('setup:setchannel:news')
                    .setPlaceholder('Select the news channel')
                    .addChannelTypes(ChannelType.GuildText),
            ),
            new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder().setCustomId('setup:setnewsrole').setPlaceholder('Role to ping on new articles (optional)'),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:editmsg:newsurl').setLabel('Set feed URL').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup:toggle:news_enabled')
                    .setLabel(config.news_enabled ? 'Disable' : 'Enable')
                    .setStyle(config.news_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
                    .setDisabled(!config.news_channel_id || !config.news_feed_url),
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

// --- Ranks & agents ----------------------------------------------------------

function countDuplicateLabels(rows) {
    const seen = new Map();
    for (const row of rows) {
        const key = `${row.category}:${row.label.toLowerCase()}`;
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    return [...seen.values()].filter((count) => count > 1).length;
}

async function renderRoles(interaction) {
    const config = await getConfig(interaction.guildId);
    const ranks = await selfRoles.getRoles(interaction.guildId, 'rank');
    const agents = await selfRoles.getRoles(interaction.guildId, 'agent');
    const duplicateGroups = countDuplicateLabels([...ranks, ...agents]);

    const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('🎮 Ranks & agents')
        .setDescription(
            'Members self-assign these from separate messages — one to pick a rank, one per agent class — ' +
                'posted together with **Post role panel**. Add ranks any time as the game evolves — new agents ' +
                'are picked up from the live Valorant roster automatically, or press **Sync agents now**.',
        )
        .addFields(
            {
                name: `Ranks (${ranks.length})`,
                value: ranks.length ? boundedJoin(ranks.map((rank) => rank.label)) : '_none yet_',
            },
            {
                name: `Agents (${agents.length})`,
                value: CLASS_ORDER.map((key) => {
                    const inClass = agents.filter((agent) => agent.group_name === key);
                    if (!inClass.length) return null;
                    return `${CLASSES[key].emoji} **${CLASSES[key].label}** — ${boundedJoin(inClass.map((agent) => agent.label), 220)}`;
                })
                    .filter(Boolean)
                    .join('\n') || '_none yet_',
            },
            { name: 'Panel channel', value: config.roles_panel_channel_id ? `<#${config.roles_panel_channel_id}>` : '_not set_' },
        );

    if (duplicateGroups) {
        embed.addFields({
            name: '⚠️ Duplicates found',
            value: `${duplicateGroups} name(s) have more than one role. Press **Clean up duplicates** to merge them.`,
        });
    }

    await respond(interaction, {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:rankdefaults').setLabel('Create default ranks').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('setup:rankadd').setLabel('Add rank').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup:rankremove')
                    .setLabel('Remove rank')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!ranks.length),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:agentdefaults').setLabel('Create default agents').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('setup:agentadd').setLabel('Add agent').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup:agentremove')
                    .setLabel('Remove agent')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!agents.length),
                new ButtonBuilder()
                    .setCustomId('setup:agentsync')
                    .setLabel('Sync agents now')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
                    .setDisabled(!agents.length),
            ),
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('setup:setchannel:rolespanel')
                    .setPlaceholder('Select the roles panel channel')
                    .addChannelTypes(ChannelType.GuildText),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup:postrolespanel')
                    .setLabel('Post role panel')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📤')
                    .setDisabled(!config.roles_panel_channel_id || (!ranks.length && !agents.length)),
                new ButtonBuilder()
                    .setCustomId('setup:dedupe')
                    .setLabel('Clean up duplicates')
                    .setStyle(duplicateGroups ? ButtonStyle.Danger : ButtonStyle.Secondary)
                    .setEmoji('🧹')
                    .setDisabled(!duplicateGroups),
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function createDefaultRoles(interaction, category, defaults) {
    const existing = await selfRoles.getRoles(interaction.guildId, category);
    const existingLabels = new Set(existing.map((row) => row.label.toLowerCase()));

    const failed = [];

    for (const entry of defaults) {
        if (existingLabels.has(entry.label.toLowerCase())) continue;

        // One bad role must not abort the rest of the batch — otherwise a single transient
        // error silently truncates the roster to whatever was created so far.
        try {
            const role = await interaction.guild.roles.create({
                name: entry.label,
                color: entry.color ?? undefined,
                hoist: category === 'rank',
                mentionable: false,
                reason: `Valorant ${category} role created by ${interaction.user.tag}`,
            });

            await selfRoles.addRole(interaction.guildId, {
                category,
                roleId: role.id,
                label: entry.label,
                group: entry.group || null,
                emoji: entry.emoji || null,
            });
        } catch (error) {
            console.error(`Could not create the ${category} role "${entry.label}" in guild ${interaction.guildId}:`, error.message);
            failed.push(entry.label);
        }
    }

    await renderRoles(interaction);

    if (failed.length) {
        await interaction.followUp({
            content: `Could not create ${failed.length} role(s): ${failed.join(', ')}. Check the bot's **Manage Roles** permission and try again.`,
            ephemeral: true,
        });
    }
}

async function syncAgentsNow(interaction) {
    const { added, locked } = await syncAgents(interaction.guild);
    await renderRoles(interaction);

    await interaction.followUp({
        content: locked
            ? 'Already syncing the roster in the background — try again in a moment.'
            : added.length
              ? `Added ${added.length} new agent(s): ${added.join(', ')}.`
              : 'Everyone is already up to date — no new agents.',
        ephemeral: true,
    });
}

async function cleanupDuplicates(interaction) {
    const { rolesRemoved, membersMigrated, labels } = await dedupeGuildRoles(interaction.guild);
    await renderRoles(interaction);

    await interaction.followUp({
        content: rolesRemoved
            ? `Removed ${rolesRemoved} duplicate role(s) (${[...new Set(labels)].join(', ')}) and moved ${membersMigrated} member(s) onto the surviving role.`
            : 'No duplicates found.',
        ephemeral: true,
    });
}

async function postRolesPanel(interaction) {
    await interaction.deferUpdate();
    const config = await getConfig(interaction.guildId);

    if (!config.roles_panel_channel_id) {
        await renderRoles(interaction);
        return;
    }

    const channel = await interaction.guild.channels.fetch(config.roles_panel_channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
        await renderRoles(interaction);
        return;
    }

    await rolePanel.postPanels(interaction.guild, channel);
    await renderRoles(interaction);
}

function showNewsUrlModal(interaction, current) {
    return interaction.showModal(
        new ModalBuilder()
            .setCustomId('setup:newsurlmodal')
            .setTitle('News feed URL')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('url')
                        .setLabel('RSS or Atom feed URL')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(300)
                        .setPlaceholder('https://example.com/valorant/feed/')
                        .setValue(current || ''),
                ),
            ),
    );
}

async function handleNewsUrlModal(interaction) {
    const url = interaction.fields.getTextInputValue('url').trim();
    if (!/^https?:\/\//i.test(url)) {
        await interaction.reply({ content: 'That does not look like a valid feed URL.', ephemeral: true });
        return;
    }

    await updateConfig(interaction.guildId, { news_feed_url: url, news_seen_ids: [] });
    await renderNews(interaction);
}

function showAddModal(interaction, category) {
    const components = [
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('name')
                .setLabel(category === 'rank' ? 'Rank name' : 'Agent name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(50),
        ),
    ];

    if (category === 'agent') {
        components.push(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('class')
                    .setLabel('Class: duelist, controller, initiator, sentinel')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(20),
            ),
        );
    }

    return interaction.showModal(
        new ModalBuilder().setCustomId(`setup:addmodal:${category}`).setTitle(`Add ${category}`).addComponents(...components),
    );
}

async function handleAddModal(interaction, category) {
    const name = interaction.fields.getTextInputValue('name').trim();
    let group = null;

    if (category === 'agent') {
        group = interaction.fields.getTextInputValue('class').trim().toLowerCase();
        if (!CLASS_ORDER.includes(group)) {
            await interaction.reply({
                content: `"${group}" is not a class. Use one of: ${CLASS_ORDER.join(', ')}.`,
                ephemeral: true,
            });
            return;
        }
    }

    const lockKey = rolesLockKey(interaction.guildId);
    if (!acquireLock(lockKey)) {
        await interaction.reply({ content: 'Already working on your role roster — try again in a moment.', ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const existing = await selfRoles.getRoles(interaction.guildId, category);
        if (existing.some((row) => row.label.toLowerCase() === name.toLowerCase())) {
            await interaction.editReply(`**${name}** already exists — nothing was created.`);
            return;
        }

        const role = await interaction.guild.roles.create({
            name,
            hoist: category === 'rank',
            mentionable: false,
            reason: `Valorant ${category} role created by ${interaction.user.tag}`,
        });

        await selfRoles.addRole(interaction.guildId, { category, roleId: role.id, label: name, group });
        await interaction.editReply(`Created **${name}** as a ${role}. Run \`/setup\` again to continue.`);
    } catch (error) {
        console.error(`Could not create the ${category} role "${name}" in guild ${interaction.guildId}:`, error.message);
        await interaction.editReply(`Could not create the role for **${name}**. Check the bot's **Manage Roles** permission and try again.`);
    } finally {
        releaseLock(lockKey);
    }
}

async function renderRemovePicker(interaction, category, group) {
    const rows = group
        ? (await selfRoles.getRoles(interaction.guildId, category)).filter((row) => row.group_name === group)
        : await selfRoles.getRoles(interaction.guildId, category);
    const options = rows.slice(0, 25);

    await respond(interaction, {
        embeds: [
            new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle(`Remove ${category}${group ? ` — ${CLASSES[group].label}` : ''}`)
                .setDescription(
                    `Pick one or more to delete their roles and remove them from the panel.` +
                        (rows.length > options.length ? `\n_Showing the first ${options.length} of ${rows.length}._` : ''),
                ),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`setup:removepick:${category}`)
                    .setPlaceholder(`Choose ${category}(s) to remove`)
                    .setMinValues(1)
                    .setMaxValues(options.length)
                    .addOptions(options.map((row) => ({ label: row.label, value: row.role_id }))),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:roles').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function renderAgentClassPicker(interaction) {
    const agents = await selfRoles.getRoles(interaction.guildId, 'agent');
    const classesInUse = CLASS_ORDER.filter((key) => agents.some((agent) => agent.group_name === key));

    await respond(interaction, {
        embeds: [
            new EmbedBuilder().setColor(0xed4245).setTitle('Remove agent').setDescription('Which class is the agent in?'),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                classesInUse.map((key) =>
                    new ButtonBuilder().setCustomId(`setup:agentremoveclass:${key}`).setLabel(CLASSES[key].label).setStyle(ButtonStyle.Secondary),
                ),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:roles').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function handleRemovePick(interaction, category) {
    await interaction.deferUpdate();

    for (const roleId of interaction.values) {
        const removed = await selfRoles.removeRole(interaction.guildId, roleId);
        if (removed) await interaction.guild.roles.delete(roleId, `Removed by ${interaction.user.tag}`).catch(() => {});
    }

    await renderRoles(interaction);
}

// --- Finish ----------------------------------------------------------------

async function handleFinish(interaction) {
    await updateConfig(interaction.guildId, { setup_completed: true, setup_step: null });
    await deployGuildCommands(interaction.guildId, true);

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Setup complete')
                .setDescription(
                    [
                        'Every command is now available.',
                        '',
                        '**Next steps**',
                        '• Post the rules and role panel from the **Rules** and **Ranks & agents** sections if you have not already.',
                        '• `/roles` — members can check what they picked.',
                        '• `/agent` — a fun random-agent roulette for when nobody can decide who to lock in.',
                        '• New agents are added automatically as Riot ships them — no action needed.',
                        '',
                        'Run `/setup` again at any time to change these settings.',
                    ].join('\n'),
                ),
        ],
        components: [],
    });
}

// --- Command ---------------------------------------------------------------

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure the Valorant community bot for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        if (!requireAdministrator(interaction)) {
            await interaction.reply({ content: 'Only a server administrator can use this command.', ephemeral: true });
            return;
        }

        await ensureConfig(interaction.guildId);
        await renderOverview(interaction);
    },

    async handleButton(interaction) {
        if (!requireAdministrator(interaction)) {
            await interaction.reply({ content: 'Only a server administrator can use this command.', ephemeral: true });
            return;
        }

        const [, action, argument] = interaction.customId.split(':');

        if (action === 'back' || action === 'refresh') return renderOverview(interaction);
        if (action === 'finish') return handleFinish(interaction);
        if (action === 'roles') return renderRoles(interaction);

        if (action === 'editmsg') {
            const config = await getConfig(interaction.guildId);

            if (argument === 'newsurl') return showNewsUrlModal(interaction, config.news_feed_url);
            if (argument === 'rules') return showRulesModal(interaction, config.rules_message);

            const settings = {
                welcome: { key: 'welcome', title: 'Welcome message', label: 'Message', maxLength: 500, placeholder: '{user} {username} {server} {membercount}' },
                goodbye: { key: 'goodbye', title: 'Goodbye message', label: 'Message', maxLength: 500, placeholder: '{user} {username} {server} {membercount}' },
            }[argument];

            return showMessageModal(interaction, settings.key, { ...settings, current: config[`${argument}_message`] });
        }

        if (action === 'toggle') {
            const config = await getConfig(interaction.guildId);
            await updateConfig(interaction.guildId, { [argument]: !config[argument] });
            if (argument === 'welcome_enabled') return renderWelcome(interaction);
            if (argument === 'goodbye_enabled') return renderGoodbye(interaction);
            if (argument === 'rules_accept_enabled') return renderRules(interaction);
            if (argument === 'news_enabled') return renderNews(interaction);
        }

        if (action === 'postrules') return postRules(interaction);
        if (action === 'postrolespanel') return postRolesPanel(interaction);

        if (action === 'agentsync') {
            await interaction.deferUpdate();
            return syncAgentsNow(interaction);
        }

        if (['rankdefaults', 'agentdefaults', 'dedupe'].includes(action)) {
            const lockKey = rolesLockKey(interaction.guildId);
            if (!acquireLock(lockKey)) {
                await interaction.reply({
                    content: 'Already working on your role roster from another click — give it a few seconds.',
                    ephemeral: true,
                });
                return;
            }

            try {
                await interaction.deferUpdate();
                if (action === 'rankdefaults') await createDefaultRoles(interaction, 'rank', DEFAULT_RANKS);
                else if (action === 'agentdefaults') await createDefaultRoles(interaction, 'agent', await getAgentRoster());
                else if (action === 'dedupe') await cleanupDuplicates(interaction);
            } finally {
                releaseLock(lockKey);
            }
            return;
        }

        if (action === 'rankadd') return showAddModal(interaction, 'rank');
        if (action === 'agentadd') return showAddModal(interaction, 'agent');
        if (action === 'rankremove') return renderRemovePicker(interaction, 'rank');
        if (action === 'agentremove') return renderAgentClassPicker(interaction);
        if (action === 'agentremoveclass') return renderRemovePicker(interaction, 'agent', argument);
    },

    async handleSelectMenu(interaction) {
        if (!requireAdministrator(interaction)) {
            await interaction.reply({ content: 'Only a server administrator can use this command.', ephemeral: true });
            return;
        }

        const [, action, argument] = interaction.customId.split(':');

        if (action === 'menu') {
            const [choice] = interaction.values;
            if (choice === 'welcome') return renderWelcome(interaction);
            if (choice === 'goodbye') return renderGoodbye(interaction);
            if (choice === 'rules') return renderRules(interaction);
            if (choice === 'roles') return renderRoles(interaction);
            if (choice === 'news') return renderNews(interaction);
        }

        if (action === 'setchannel') {
            const field = CHANNEL_FIELDS[argument];
            const [channelId] = interaction.values;
            await updateConfig(interaction.guildId, { [field.column]: channelId });

            if (argument === 'welcome') return renderWelcome(interaction);
            if (argument === 'goodbye') return renderGoodbye(interaction);
            if (argument === 'rules') return renderRules(interaction);
            if (argument === 'rolespanel') return renderRoles(interaction);
            if (argument === 'news') return renderNews(interaction);
        }

        if (action === 'setacceptrole') {
            const [roleId] = interaction.values;
            await updateConfig(interaction.guildId, { rules_accept_role_id: roleId });
            return renderRules(interaction);
        }

        if (action === 'setnewsrole') {
            const [roleId] = interaction.values;
            await updateConfig(interaction.guildId, { news_mention_role_id: roleId });
            return renderNews(interaction);
        }

        if (action === 'removepick') return handleRemovePick(interaction, argument);
    },

    async handleModalSubmit(interaction) {
        if (!requireAdministrator(interaction)) {
            await interaction.reply({ content: 'Only a server administrator can use this form.', ephemeral: true });
            return;
        }

        const [, action, argument] = interaction.customId.split(':');
        if (action === 'msgmodal') return handleMessageModal(interaction, argument);
        if (action === 'addmodal') return handleAddModal(interaction, argument);
        if (action === 'newsurlmodal') return handleNewsUrlModal(interaction);
        if (action === 'rulesmodal') return handleRulesModal(interaction);
    },
};
