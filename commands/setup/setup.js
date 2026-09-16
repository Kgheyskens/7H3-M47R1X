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

const { deployGuildCommands } = require('../../deploy/deployCommands');
const { ensureConfig, getConfig, updateConfig } = require('../../utils/configStore');
const { rolesPanelPayload, rulesPayload } = require('../../utils/panelRender');
const selfRoles = require('../../utils/selfRoles');
const { CLASS_ORDER, CLASSES, DEFAULT_AGENTS, DEFAULT_RANKS } = require('../../utils/valorantData');
const { DEFAULT_GOODBYE, DEFAULT_WELCOME } = require('../../utils/welcomeGoodbye');

const CHANNEL_FIELDS = {
    welcome: { column: 'welcome_channel_id', label: 'Welcome channel' },
    goodbye: { column: 'goodbye_channel_id', label: 'Goodbye channel' },
    rules: { column: 'rules_channel_id', label: 'Rules channel' },
    rolespanel: { column: 'roles_panel_channel_id', label: 'Roles panel channel' },
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
                    `${check(agents.length)} **${agents.length}** agent role(s)`,
                    `${check(config.roles_panel_channel_id)} **Panel channel** — ${config.roles_panel_channel_id ? `<#${config.roles_panel_channel_id}>` : '_not set_'}`,
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
    const column = key === 'rules' ? 'rules_message' : `${key}_message`;
    await updateConfig(interaction.guildId, { [column]: message });

    if (key === 'welcome') await renderWelcome(interaction);
    else if (key === 'goodbye') await renderGoodbye(interaction);
    else if (key === 'rules') await renderRules(interaction);
}

// --- Rules -----------------------------------------------------------------

async function renderRules(interaction) {
    const config = await getConfig(interaction.guildId);

    const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('📜 Rules')
        .addFields(
            { name: 'Channel', value: config.rules_channel_id ? `<#${config.rules_channel_id}>` : '_not set_' },
            { name: 'Text', value: config.rules_message || '_not set yet_' },
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

// --- Ranks & agents ----------------------------------------------------------

async function renderRoles(interaction) {
    const config = await getConfig(interaction.guildId);
    const ranks = await selfRoles.getRoles(interaction.guildId, 'rank');
    const agents = await selfRoles.getRoles(interaction.guildId, 'agent');

    const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('🎮 Ranks & agents')
        .setDescription('Members self-assign these from a panel. Add ranks any time as the game evolves.')
        .addFields(
            {
                name: `Ranks (${ranks.length})`,
                value: ranks.length ? ranks.map((rank) => `<@&${rank.role_id}>`).join(', ') : '_none yet_',
            },
            {
                name: `Agents (${agents.length})`,
                value: CLASS_ORDER.map((key) => {
                    const inClass = agents.filter((agent) => agent.group_name === key);
                    if (!inClass.length) return null;
                    return `${CLASSES[key].emoji} **${CLASSES[key].label}** — ${inClass.map((agent) => `<@&${agent.role_id}>`).join(', ')}`;
                })
                    .filter(Boolean)
                    .join('\n') || '_none yet_',
            },
            { name: 'Panel channel', value: config.roles_panel_channel_id ? `<#${config.roles_panel_channel_id}>` : '_not set_' },
        );

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
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function createDefaultRoles(interaction, category, defaults) {
    await interaction.deferUpdate();
    const existing = await selfRoles.getRoles(interaction.guildId, category);
    const existingLabels = new Set(existing.map((row) => row.label.toLowerCase()));

    for (const entry of defaults) {
        if (existingLabels.has(entry.label.toLowerCase())) continue;

        const role = await interaction.guild.roles.create({
            name: entry.label,
            color: entry.color,
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
    }

    await renderRoles(interaction);
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

    const payload = await rolesPanelPayload(interaction.guildId);
    const existing = config.roles_panel_message_id
        ? await channel.messages.fetch(config.roles_panel_message_id).catch(() => null)
        : null;
    const message = existing ? await existing.edit(payload) : await channel.send(payload);

    await updateConfig(interaction.guildId, { roles_panel_message_id: message.id });
    await renderRoles(interaction);
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

    await interaction.deferReply({ ephemeral: true });

    const role = await interaction.guild.roles.create({
        name,
        hoist: category === 'rank',
        mentionable: false,
        reason: `Valorant ${category} role created by ${interaction.user.tag}`,
    });

    await selfRoles.addRole(interaction.guildId, { category, roleId: role.id, label: name, group });

    await interaction.editReply(`Created **${name}** as a ${role}. Run \`/setup\` again to continue.`);
}

async function renderRemovePicker(interaction, category, group) {
    const rows = group
        ? (await selfRoles.getRoles(interaction.guildId, category)).filter((row) => row.group_name === group)
        : await selfRoles.getRoles(interaction.guildId, category);

    await respond(interaction, {
        embeds: [
            new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle(`Remove ${category}${group ? ` — ${CLASSES[group].label}` : ''}`)
                .setDescription('Pick one to delete its role and remove it from the panel.'),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`setup:removepick:${category}`)
                    .setPlaceholder(`Choose a ${category} to remove`)
                    .addOptions(rows.map((row) => ({ label: row.label, value: row.role_id }))),
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
    const [roleId] = interaction.values;
    const removed = await selfRoles.removeRole(interaction.guildId, roleId);
    if (removed) await interaction.guild.roles.delete(roleId, `Removed by ${interaction.user.tag}`).catch(() => {});
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
            const settings = {
                welcome: { key: 'welcome', title: 'Welcome message', label: 'Message', maxLength: 500, placeholder: '{user} {username} {server} {membercount}' },
                goodbye: { key: 'goodbye', title: 'Goodbye message', label: 'Message', maxLength: 500, placeholder: '{user} {username} {server} {membercount}' },
                rules: { key: 'rules', title: 'Rules text', label: 'Rules', maxLength: 4000, placeholder: 'Be respectful. No cheating. Have fun.' },
            }[argument];

            const config = await getConfig(interaction.guildId);
            const current = argument === 'rules' ? config.rules_message : config[`${argument}_message`];
            return showMessageModal(interaction, settings.key, { ...settings, current });
        }

        if (action === 'toggle') {
            const config = await getConfig(interaction.guildId);
            await updateConfig(interaction.guildId, { [argument]: !config[argument] });
            if (argument === 'welcome_enabled') return renderWelcome(interaction);
            if (argument === 'goodbye_enabled') return renderGoodbye(interaction);
            if (argument === 'rules_accept_enabled') return renderRules(interaction);
        }

        if (action === 'postrules') return postRules(interaction);
        if (action === 'postrolespanel') return postRolesPanel(interaction);

        if (action === 'rankdefaults') return createDefaultRoles(interaction, 'rank', DEFAULT_RANKS);
        if (action === 'agentdefaults') return createDefaultRoles(interaction, 'agent', DEFAULT_AGENTS);
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
        }

        if (action === 'setchannel') {
            const field = CHANNEL_FIELDS[argument];
            const [channelId] = interaction.values;
            await updateConfig(interaction.guildId, { [field.column]: channelId });

            if (argument === 'welcome') return renderWelcome(interaction);
            if (argument === 'goodbye') return renderGoodbye(interaction);
            if (argument === 'rules') return renderRules(interaction);
            if (argument === 'rolespanel') return renderRoles(interaction);
        }

        if (action === 'setacceptrole') {
            const [roleId] = interaction.values;
            await updateConfig(interaction.guildId, { rules_accept_role_id: roleId });
            return renderRules(interaction);
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
    },
};
