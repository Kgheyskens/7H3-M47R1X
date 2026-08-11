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
const { ensureConfig, getConfig, missingRequirements, updateConfig } = require('../../utils/configStore');
const { clearNewsFeed, setNewsFeed } = require('../../utils/fortniteNews');
const { clearShopPanel, setShopPanel } = require('../../utils/fortniteShop');
const teamStore = require('../../utils/teamStore');

const CHANNEL_FIELDS = {
    submission: {
        column: 'submission_channel_id',
        label: 'Submission review channel',
        hint: 'Where new match submissions are announced for staff.',
    },
    leaderboard: {
        column: 'leaderboard_channel_id',
        label: 'Leaderboard channel',
        hint: 'Where the live team and player boards are posted.',
    },
    announcement: {
        column: 'announcement_channel_id',
        label: 'Announcement channel',
        hint: 'Where tournaments and creator codes are announced.',
    },
    teampanel: {
        column: 'team_panel_channel_id',
        label: 'Team join channel',
        hint: 'Where members pick their team.',
    },
    shop: { column: 'shop_channel_id', label: 'Item shop channel', hint: 'Where the daily item shop is posted.' },
    news: { column: 'news_channel_id', label: 'News channel', hint: 'Where Fortnite news and updates are posted.' },
};

const TEAM_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xe91e63];

function check(value) {
    return value ? '✅' : '⬜';
}

function channelLine(key, config) {
    const field = CHANNEL_FIELDS[key];
    const value = config[field.column];
    return `${check(value)} **${field.label}** — ${value ? `<#${value}>` : '_not set_'}`;
}

function feedTarget(enabled, channelId) {
    if (!enabled) return '_disabled_';
    return channelId ? `<#${channelId}>` : '_no channel selected_';
}

async function overviewEmbed(guild) {
    const config = await getConfig(guild.id);
    const teams = await teamStore.getTeams(guild.id);
    const missing = missingRequirements(config, teams.length);

    const teamList = teams.length
        ? teams.map((team) => `<@&${team.role_id}>`).join(', ')
        : '_no teams yet_';

    const embed = new EmbedBuilder()
        .setColor(config.setup_completed ? 0x57f287 : 0x5865f2)
        .setTitle('⚙️ Tournament bot setup')
        .setDescription(
            config.setup_completed
                ? 'Setup is complete. All commands are available. You can change any setting below.'
                : 'Complete the required steps below, then press **Finish setup** to unlock every command.',
        )
        .addFields(
            {
                name: 'Teams',
                value: `${check(teams.length >= 2)} ${teams.length} team${teams.length === 1 ? '' : 's'} — ${teamList}`,
            },
            {
                name: 'Channels',
                value: [
                    channelLine('submission', config),
                    channelLine('leaderboard', config),
                    channelLine('announcement', config),
                    channelLine('teampanel', config),
                ].join('\n'),
            },
            {
                name: 'Fortnite feeds',
                value: [
                    `${check(config.shop_enabled)} **Item shop** — ${feedTarget(config.shop_enabled, config.shop_channel_id)}`,
                    `${check(config.news_enabled)} **News & updates** — ${feedTarget(config.news_enabled, config.news_channel_id)}`,
                ].join('\n'),
            },
            {
                name: 'Scoring & options',
                value: [
                    `🎯 **${config.points_per_kill}** point${config.points_per_kill === 1 ? '' : 's'} per kill · 🏆 **${config.points_per_win}** per win`,
                    `${check(config.ai_enabled)} AI screenshot verification`,
                    `${check(config.player_submissions_enabled)} Players may submit their own results`,
                    `${check(config.team_switching_allowed)} Members may switch teams freely`,
                ].join('\n'),
            },
        );

    if (missing.length) {
        embed.addFields({ name: '⚠️ Still required', value: missing.map((item) => `• ${item}`).join('\n') });
    }

    return { embed, config, teams, missing };
}

function overviewComponents(config) {
    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('setup:menu')
                .setPlaceholder('Choose what to configure')
                .addOptions(
                    { label: 'Teams', value: 'teams', description: 'Create or link the competing teams.', emoji: '👥' },
                    { label: 'Channels', value: 'channels', description: 'Pick the channels the bot posts in.', emoji: '📺' },
                    { label: 'Fortnite feeds', value: 'feeds', description: 'Item shop and news feed.', emoji: '🛒' },
                    { label: 'Scoring', value: 'scoring', description: 'Points per kill and per win.', emoji: '🎯' },
                    { label: 'Options', value: 'options', description: 'AI, submissions and team switching.', emoji: '🔧' },
                ),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup:finish')
                .setLabel(config.setup_completed ? 'Re-check and save' : 'Finish setup')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('setup:refresh')
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄'),
        ),
    ];
}

async function renderOverview(interaction) {
    const { embed, config } = await overviewEmbed(interaction.guild);
    const payload = { embeds: [embed], components: overviewComponents(config) };

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply(payload);
    } else if (interaction.isChatInputCommand()) {
        await interaction.reply({ ...payload, ephemeral: true });
    } else {
        await interaction.update(payload);
    }
}

function requireAdministrator(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

// --- Teams -----------------------------------------------------------------

async function renderTeams(interaction) {
    const teams = await teamStore.getTeams(interaction.guildId);

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('👥 Teams')
        .setDescription(
            [
                'Teams are Discord roles. Members join one and their tournament points count for that team.',
                '',
                '**Create teams** lets the bot make the roles for you.',
                '**Link existing roles** turns roles you already have into teams.',
            ].join('\n'),
        )
        .addFields({
            name: `Current teams (${teams.length})`,
            value: teams.length ? teams.map((team) => `• <@&${team.role_id}>`).join('\n') : '_none yet_',
        });

    await interaction.update({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('setup:teamroles')
                    .setPlaceholder('Link existing roles as teams')
                    .setMinValues(2)
                    .setMaxValues(8),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup:teamcreate')
                    .setLabel('Create teams for me')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✨'),
                new ButtonBuilder()
                    .setCustomId('setup:teamclear')
                    .setLabel('Remove all teams')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️'),
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function handleTeamCreateModal(interaction) {
    const raw = interaction.fields.getTextInputValue('names');
    const names = [...new Set(raw.split(/[\n,]/).map((name) => name.trim()).filter(Boolean))].slice(0, 8);

    if (names.length < 2) {
        await interaction.reply({ content: 'Enter at least two team names.', ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    const created = [];
    for (const [index, name] of names.entries()) {
        const role = await interaction.guild.roles.create({
            name: name.slice(0, 90),
            color: TEAM_COLORS[index % TEAM_COLORS.length],
            hoist: true,
            mentionable: true,
            reason: `Tournament team created by ${interaction.user.tag}`,
        });
        created.push({ roleId: role.id, name: role.name, color: TEAM_COLORS[index % TEAM_COLORS.length] });
    }

    await teamStore.replaceTeams(interaction.guildId, created);
    await interaction.editReply(
        `Created ${created.length} teams: ${created.map((team) => `<@&${team.roleId}>`).join(', ')}\n\nRun \`/setup\` again to continue.`,
    );
}

async function handleTeamRoles(interaction) {
    const me = await interaction.guild.members.fetchMe();
    const roles = interaction.values.map((id) => interaction.guild.roles.cache.get(id)).filter(Boolean);

    const invalid = roles.find(
        (role) => role.managed || role.id === interaction.guildId || role.position >= me.roles.highest.position,
    );

    if (invalid) {
        await interaction.reply({
            content: `I cannot manage ${invalid}. Choose normal roles below my highest role.`,
            ephemeral: true,
        });
        return;
    }

    await teamStore.replaceTeams(
        interaction.guildId,
        roles.map((role) => ({ roleId: role.id, name: role.name, color: role.color || null })),
    );

    await renderTeams(interaction);
}

// --- Channels --------------------------------------------------------------

async function renderChannels(interaction) {
    const config = await getConfig(interaction.guildId);

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📺 Channels')
        .setDescription(
            Object.entries(CHANNEL_FIELDS)
                .filter(([key]) => !['shop', 'news'].includes(key))
                .map(([key]) => `${channelLine(key, config)}\n_${CHANNEL_FIELDS[key].hint}_`)
                .join('\n\n'),
        );

    await interaction.update({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('setup:pickchannel')
                    .setPlaceholder('Which channel do you want to set?')
                    .addOptions(
                        { label: 'Submission review channel', value: 'submission' },
                        { label: 'Leaderboard channel', value: 'leaderboard' },
                        { label: 'Announcement channel', value: 'announcement' },
                        { label: 'Team join channel', value: 'teampanel' },
                    ),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function renderChannelPicker(interaction, key) {
    const field = CHANNEL_FIELDS[key];

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`📺 ${field.label}`)
                .setDescription(field.hint),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(`setup:setchannel:${key}`)
                    .setPlaceholder('Select a text channel')
                    .addChannelTypes(ChannelType.GuildText)
                    .setMinValues(1)
                    .setMaxValues(1),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:channels').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function handleSetChannel(interaction, key) {
    const field = CHANNEL_FIELDS[key];
    const [channelId] = interaction.values;

    await updateConfig(interaction.guildId, { [field.column]: channelId });

    if (key === 'shop') await setShopPanel(interaction.guildId, channelId, [], null);
    if (key === 'news') {
        const config = await getConfig(interaction.guildId);
        await setNewsFeed(interaction.guildId, channelId, config.news_mention_role_id);
    }

    if (key === 'shop' || key === 'news') {
        await renderFeeds(interaction);
        return;
    }

    await renderChannels(interaction);
}

// --- Feeds -----------------------------------------------------------------

async function renderFeeds(interaction) {
    const config = await getConfig(interaction.guildId);

    const embed = new EmbedBuilder()
        .setColor(0x55d6ff)
        .setTitle('🛒 Fortnite feeds')
        .setDescription('Both feeds are optional and post in a channel of your choice.')
        .addFields(
            {
                name: `${check(config.shop_enabled)} Item shop`,
                value: config.shop_channel_id
                    ? `Posts in <#${config.shop_channel_id}>, refreshed every 15 minutes.`
                    : '_no channel selected_',
            },
            {
                name: `${check(config.news_enabled)} News & updates`,
                value: config.news_channel_id
                    ? `Posts in <#${config.news_channel_id}>, checked every 10 minutes.`
                    : '_no channel selected_',
            },
        );

    await interaction.update({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup:toggle:shop_enabled')
                    .setLabel(config.shop_enabled ? 'Disable item shop' : 'Enable item shop')
                    .setStyle(config.shop_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('setup:pick:shop')
                    .setLabel('Item shop channel')
                    .setStyle(ButtonStyle.Secondary),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup:toggle:news_enabled')
                    .setLabel(config.news_enabled ? 'Disable news' : 'Enable news')
                    .setStyle(config.news_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('setup:pick:news')
                    .setLabel('News channel')
                    .setStyle(ButtonStyle.Secondary),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

// --- Options and scoring ---------------------------------------------------

async function renderOptions(interaction) {
    const config = await getConfig(interaction.guildId);

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🔧 Options')
        .addFields(
            {
                name: `${check(config.ai_enabled)} AI screenshot verification`,
                value: 'Reads kills, the win banner and the Epic name from an uploaded screenshot. A human always confirms in the dashboard.',
            },
            {
                name: `${check(config.player_submissions_enabled)} Player submissions`,
                value: 'When off, only staff can submit results with `/admin-submit`.',
            },
            {
                name: `${check(config.team_switching_allowed)} Free team switching`,
                value: 'When off, a team choice is permanent until an administrator resets it.',
            },
        );

    await interaction.update({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup:toggle:ai_enabled')
                    .setLabel('AI verification')
                    .setStyle(config.ai_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup:toggle:player_submissions_enabled')
                    .setLabel('Player submissions')
                    .setStyle(config.player_submissions_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup:toggle:team_switching_allowed')
                    .setLabel('Team switching')
                    .setStyle(config.team_switching_allowed ? ButtonStyle.Success : ButtonStyle.Secondary),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
            ),
        ],
    });
}

async function showScoringModal(interaction) {
    const config = await getConfig(interaction.guildId);

    await interaction.showModal(
        new ModalBuilder()
            .setCustomId('setup:scoring')
            .setTitle('Scoring')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('per_kill')
                        .setLabel('Points per kill')
                        .setStyle(TextInputStyle.Short)
                        .setValue(String(config.points_per_kill))
                        .setRequired(true)
                        .setMaxLength(3),
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('per_win')
                        .setLabel('Points for a Victory Royale')
                        .setStyle(TextInputStyle.Short)
                        .setValue(String(config.points_per_win))
                        .setRequired(true)
                        .setMaxLength(3),
                ),
            ),
    );
}

async function handleScoringModal(interaction) {
    const perKill = Number.parseInt(interaction.fields.getTextInputValue('per_kill'), 10);
    const perWin = Number.parseInt(interaction.fields.getTextInputValue('per_win'), 10);

    if (!Number.isInteger(perKill) || perKill < 0 || !Number.isInteger(perWin) || perWin < 0) {
        await interaction.reply({ content: 'Enter whole numbers of 0 or higher.', ephemeral: true });
        return;
    }

    await updateConfig(interaction.guildId, { points_per_kill: perKill, points_per_win: perWin });
    await renderOverview(interaction);
}

// --- Finish ----------------------------------------------------------------

async function handleFinish(interaction) {
    const { embed, config, teams, missing } = await overviewEmbed(interaction.guild);

    if (missing.length) {
        await interaction.update({ embeds: [embed], components: overviewComponents(config) });
        await interaction.followUp({
            content: `Setup is not complete yet:\n${missing.map((item) => `• ${item}`).join('\n')}`,
            ephemeral: true,
        });
        return;
    }

    await updateConfig(interaction.guildId, { setup_completed: true, setup_step: null });

    if (!config.shop_enabled) await clearShopPanel(interaction.guildId);
    if (!config.news_enabled) await clearNewsFeed(interaction.guildId);

    await deployGuildCommands(interaction.guildId, true);

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Setup complete')
                .setDescription(
                    [
                        `**${teams.length}** teams are ready and every command is now available.`,
                        '',
                        '**Next steps**',
                        '• `/manage team panel` — post the team join panel so members can pick a team.',
                        '• `/manage leaderboard post` — post the live team and player boards.',
                        '• `/manage tournament create` — open your first tournament.',
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
        .setDescription('Configure the tournament bot for this server.')
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
        if (action === 'channels') return renderChannels(interaction);
        if (action === 'pick') return renderChannelPicker(interaction, argument);
        if (action === 'finish') return handleFinish(interaction);
        if (action === 'scoring') return showScoringModal(interaction);

        if (action === 'toggle') {
            const config = await getConfig(interaction.guildId);
            const next = !config[argument];
            await updateConfig(interaction.guildId, { [argument]: next });

            if (argument === 'shop_enabled' && !next) await clearShopPanel(interaction.guildId);
            if (argument === 'news_enabled' && !next) await clearNewsFeed(interaction.guildId);

            return ['shop_enabled', 'news_enabled'].includes(argument)
                ? renderFeeds(interaction)
                : renderOptions(interaction);
        }

        if (action === 'teamcreate') {
            return interaction.showModal(
                new ModalBuilder()
                    .setCustomId('setup:teamnames')
                    .setTitle('Create teams')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('names')
                                .setLabel('Team names, one per line (2-8)')
                                .setStyle(TextInputStyle.Paragraph)
                                .setPlaceholder('Team Alpha\nTeam Bravo\nTeam Charlie')
                                .setRequired(true)
                                .setMaxLength(400),
                        ),
                    ),
            );
        }

        if (action === 'teamclear') {
            await teamStore.replaceTeams(interaction.guildId, []);
            return renderTeams(interaction);
        }
    },

    async handleSelectMenu(interaction) {
        if (!requireAdministrator(interaction)) {
            await interaction.reply({ content: 'Only a server administrator can use this command.', ephemeral: true });
            return;
        }

        const [, action, argument] = interaction.customId.split(':');

        if (action === 'menu') {
            const [choice] = interaction.values;
            if (choice === 'teams') return renderTeams(interaction);
            if (choice === 'channels') return renderChannels(interaction);
            if (choice === 'feeds') return renderFeeds(interaction);
            if (choice === 'options') return renderOptions(interaction);
            if (choice === 'scoring') return showScoringModal(interaction);
        }

        if (action === 'teamroles') return handleTeamRoles(interaction);
        if (action === 'pickchannel') return renderChannelPicker(interaction, interaction.values[0]);
        if (action === 'setchannel') return handleSetChannel(interaction, argument);
    },

    async handleModalSubmit(interaction) {
        if (!requireAdministrator(interaction)) {
            await interaction.reply({ content: 'Only a server administrator can use this form.', ephemeral: true });
            return;
        }

        const [, action] = interaction.customId.split(':');
        if (action === 'teamnames') return handleTeamCreateModal(interaction);
        if (action === 'scoring') return handleScoringModal(interaction);
    },
};
