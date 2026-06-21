// ================================================================
// 🎙️  ESCAPE ROOM BOT — MULTI-STORY EDITION
// ================================================================
// How it works:
//  - Every story lives in data/stories/*.js
//  - The bot auto-loads all stories on startup
//  - Players can play several stories at the same time
//
//  Player commands:
//    /startstory   → pick a story and begin
//    /answer       → submit an answer (bot detects your active story)
//    /hint         → ask for a hint (limited per level)
//    /myprogress   → overview of all your stories
//
//  Admin commands:
//    /setup        → build all channels & roles for every story
//    /reset        → reset a player
//    /newstory     → announce a new story to past winners
//    /serverprogress → see how everyone is doing
// ================================================================

const http = require('http');
const {
  Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder,
  PermissionsBitField, REST, Routes, ChannelType,
} = require('discord.js');
require('dotenv').config();

const {
  allStories, getStory, getUserProgress,
  makeRoleName, makeWinnerRoleName,
} = require('./data/index');

// ────────────────────────────────────────────────────────────────
// ⚙️  CONFIG
// ────────────────────────────────────────────────────────────────
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID:  process.env.GUILD_ID,
  LOG_NAME:   'escape-log',
  HUB_NAME:   'escape-room-hub', // public channel where players pick a story
  LOUNGE_NAME:'lounge',          // public free-chat channel (players may type here)
  PORT:       process.env.PORT || 3000,
};

// ────────────────────────────────────────────────────────────────
// 🌐  KEEPALIVE WEB SERVER
// Render Web Services REQUIRE an open port, and UptimeRobot needs a
// URL to ping. This tiny server covers both: it answers "OK" on / .
// Point UptimeRobot at your Render URL (e.g. https://your-app.onrender.com)
// with a 5-minute interval to stop the free instance from sleeping.
// ────────────────────────────────────────────────────────────────
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Escape Room Bot is alive ✅');
  })
  .listen(CONFIG.PORT, () => {
    console.log(`🌐 Keepalive server listening on port ${CONFIG.PORT}`);
  });

// ────────────────────────────────────────────────────────────────
// 🔌  CLIENT
// ────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ────────────────────────────────────────────────────────────────
// 📊  STATE
// hintCounters: Map<userId, Map<"storyId-levelId", hintIndex>>
// ────────────────────────────────────────────────────────────────
const hintCounters = new Map();

function hintKey(storyId, levelId) { return `${storyId}-${levelId}`; }

function getHint(userId, storyId, levelId) {
  if (!hintCounters.has(userId)) hintCounters.set(userId, new Map());
  return hintCounters.get(userId).get(hintKey(storyId, levelId)) ?? 0;
}

function incrementHint(userId, storyId, levelId) {
  if (!hintCounters.has(userId)) hintCounters.set(userId, new Map());
  const k = hintKey(storyId, levelId);
  hintCounters.get(userId).set(k, (hintCounters.get(userId).get(k) ?? 0) + 1);
}

// ────────────────────────────────────────────────────────────────
// 🔧  HELPERS
// ────────────────────────────────────────────────────────────────
async function log(guild, msg) {
  const ch = guild.channels.cache.find(c => c.name === CONFIG.LOG_NAME);
  if (!ch) return;
  await ch
    .send({ embeds: [new EmbedBuilder().setColor('#555555').setDescription(msg).setTimestamp()] })
    .catch(() => {});
}

async function getOrCreateRole(guild, name, color) {
  return (
    guild.roles.cache.find(r => r.name === name) ??
    (await guild.roles.create({ name, color: color ?? '#99aab5', reason: 'Escape Room' }))
  );
}

// Difficulty (1-5) → colour. All 6-digit hex so discord.js never throws.
const DIFF_COLOR = ['#99aab5', '#57f287', '#3498db', '#9b59b6', '#ffd700'];
function diffColor(d) { return DIFF_COLOR[Math.min(Math.max(d - 1, 0), DIFF_COLOR.length - 1)]; }

// ────────────────────────────────────────────────────────────────
// 🏗️  SETUP — builds every channel & role for every story
// ────────────────────────────────────────────────────────────────
async function runSetup(guild) {
  const messages = ['⚙️ Setup started...'];
  const botRole = guild.members.me?.roles.highest;

  async function mkCategory(name, overwrites) {
    return (
      guild.channels.cache.find(c => c.name === name && c.type === ChannelType.GuildCategory) ??
      (await guild.channels.create({
        name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'Escape Room',
      }))
    );
  }

  async function mkChannel(name, parent, topic, contentToSend) {
    let ch = guild.channels.cache.find(c => c.name === name && c.parentId === parent.id);
    if (!ch) {
      ch = await guild.channels.create({
        name, type: ChannelType.GuildText, parent: parent.id, topic: topic ?? '', reason: 'Escape Room',
      });
    }
    if (contentToSend) {
      const msgs = await ch.messages.fetch({ limit: 1 });
      if (msgs.size === 0) {
        await ch.send({ embeds: [new EmbedBuilder().setColor('#2b2d31').setDescription(contentToSend)] });
      }
    }
    return ch;
  }

  // 1. Public hub category.
  //    NOTE: Discord requires BOTH SendMessages AND UseApplicationCommands for
  //    a user to run a slash command. So we must ALLOW SendMessages here, and
  //    instead keep the channel chat-free by auto-deleting any human message
  //    (see the messageCreate listener further down). The #lounge is exempt.
  const hubCat = await mkCategory('🎮 ESCAPE ROOM', [
    {
      id: guild.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.UseApplicationCommands],
    },
    ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }] : []),
  ]);

  const hub = await mkChannel(CONFIG.HUB_NAME, hubCat, 'Pick a story and start your adventure');
  const hubMsgs = await hub.messages.fetch({ limit: 1 });
  if (hubMsgs.size === 0) {
    const stories = allStories();
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('🎮 Escape Room — Choose your adventure')
      .setDescription(
        'Welcome. Several stories are waiting for you.\n\n' +
        'Use `/startstory` to begin. You can play multiple stories at once.\n\n' +
        stories
          .map(s => `${s.emoji} **${s.name}** — ${s.levels.length} levels\n*${s.description}*`)
          .join('\n\n'))
      .setFooter({ text: '/startstory · /answer · /hint · /myprogress' });
    await hub.send({ embeds: [embed] });
  }
  messages.push('✅ Hub created');

  // Lounge — the ONE public channel where players may freely chat.
  // It's excluded from the auto-delete listener by name, so messages stay.
  await mkChannel(
    CONFIG.LOUNGE_NAME,
    hubCat,
    'Hang out and chat with other players',
    '💬 **Welcome to the lounge!**\n\nThis is the one place you can chat freely. Have fun, no spoilers please!');
  messages.push('✅ Lounge created');

  // 2. Per story: roles + channels
  for (const story of allStories()) {
    const storyEmoji = story.emoji ?? '📖';

    for (const level of story.levels) {
      await getOrCreateRole(guild, makeRoleName(story.id, level.id), diffColor(level.difficulty));
    }

    const winnerRole = await getOrCreateRole(guild, makeWinnerRoleName(story.id), '#ffd700');

    for (const level of story.levels) {
      const role = guild.roles.cache.find(r => r.name === makeRoleName(story.id, level.id));

      const catName = `${storyEmoji} ${story.name.toUpperCase()} — L${level.id}`;
      const cat = await mkCategory(catName, [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        // Players on this level can see the channels and use commands. Discord
        // forces us to also allow SendMessages for commands to work; free chat
        // is stripped by the auto-delete listener instead.
        ...(role ? [{
          id: role.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.UseApplicationCommands],
        }] : []),
        ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }] : []),
      ]);

      for (const channel of level.channels) {
        await mkChannel(channel.name, cat, channel.description, channel.content);
      }

      await mkChannel(
        `answer-${story.id}-l${level.id}`,
        cat,
        `Use /answer to submit your answer for ${story.name} Level ${level.id}`,
        `**Level ${level.id} — ${level.name}**\n\nUse \`/answer [your answer]\` to continue.\nStuck? Try \`/hint\`.`);
    }

    // Winners area for this story
    const winCatName = `🏆 ${story.name.toUpperCase()} — COMPLETED`;
    const winCat = await mkCategory(winCatName, [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      // Winners can see their trophy channels and use commands. SendMessages is
      // allowed (required for commands); free chat is stripped by auto-delete.
      {
        id: winnerRole.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.UseApplicationCommands],
      },
      ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }] : []),
    ]);
    await mkChannel(`${story.id}-winners`, winCat, `Winners of ${story.name}`);
    await mkChannel(`${story.id}-hall-of-fame`, winCat, `Hall of Fame — ${story.name}`);

    messages.push(`✅ ${storyEmoji} ${story.name} — roles & channels created`);
  }

  // 3. Admin log
  const adminCat = await mkCategory('⚙️ ADMIN', [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }] : []),
  ]);
  await mkChannel(CONFIG.LOG_NAME, adminCat, 'Internal logs');
  messages.push('✅ Admin log created');

  return messages;
}

// ────────────────────────────────────────────────────────────────
// 🧹  TEARDOWN — deletes every channel/category/role this bot creates
//     Recognizes BOTH the old Dutch and the new English names, so it
//     also cleans up duplicates left over from the language switch.
//     Use it to wipe the server, then run /setup again for a clean build.
// ────────────────────────────────────────────────────────────────
async function runTeardown(guild) {
  let channelsDeleted = 0;
  let rolesDeleted = 0;

  // Top-level category names the bot uses (English + old Dutch).
  const categoryPrefixes = [
    '🎮 ESCAPE ROOM', '⚙️ ADMIN',
    '🏆',                       // "🏆 STORY — COMPLETED" / "🏆 ... — VOLTOOID"
  ];
  // Per-story level categories start with the story emoji + name; we match
  // them by the " — L" / "— L" marker plus the completed/winner categories.
  function isBotCategory(name) {
    if (categoryPrefixes.some(p => name.startsWith(p))) return true;
    if (/ — L\d+$/.test(name)) return true;       // "📻 STORY — L3"
    if (name.includes('VOLTOOID') || name.includes('COMPLETED')) return true;
    return false;
  }

  // Channel name patterns the bot creates.
  function isBotChannel(name) {
    return (
      name === CONFIG.HUB_NAME ||
      name === 'escape-room-hub' ||
      name === CONFIG.LOUNGE_NAME ||
      name === 'lounge' ||
      name === CONFIG.LOG_NAME ||
      name === 'escape-log' ||
      /^answer-/.test(name) ||
      /^antwoord-/.test(name) ||              // old Dutch answer channels
      /-winners$/.test(name) ||
      /-winnaars$/.test(name) ||              // old Dutch
      /-hall-of-fame$/.test(name)
    );
  }

  // 1. Delete categories (and everything inside them).
  for (const [, ch] of guild.channels.cache) {
    if (ch.type === ChannelType.GuildCategory && isBotCategory(ch.name)) {
      // Delete children first, then the category itself.
      for (const [, child] of guild.channels.cache.filter(c => c.parentId === ch.id)) {
        await child.delete('Escape Room teardown').then(() => channelsDeleted++).catch(() => {});
      }
      await ch.delete('Escape Room teardown').then(() => channelsDeleted++).catch(() => {});
    }
  }

  // 2. Delete any stray bot channels not inside a bot category.
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildCategory && isBotChannel(ch.name)) {
      await ch.delete('Escape Room teardown').then(() => channelsDeleted++).catch(() => {});
    }
  }

  // 3. Delete the bot's roles (level roles + winner roles, English + Dutch).
  for (const [, role] of guild.roles.cache) {
    const n = role.name;
    const isLevelRole   = /-L\d+$/.test(n);
    const isWinnerRole  = /-completed$/.test(n) || /-voltooid$/.test(n);
    if (isLevelRole || isWinnerRole) {
      await role.delete('Escape Room teardown').then(() => rolesDeleted++).catch(() => {});
    }
  }

  return { channelsDeleted, rolesDeleted };
}

// ────────────────────────────────────────────────────────────────
// 📋  SLASH COMMANDS
// ────────────────────────────────────────────────────────────────
function buildCommands() {
  const stories = allStories();
  const storyChoices = stories.map(s => ({ name: `${s.emoji} ${s.name}`, value: s.id }));

  return [
    new SlashCommandBuilder()
      .setName('startstory')
      .setDescription('Pick a story to start or return to')
      .addStringOption(o => o
        .setName('story')
        .setDescription('Which story do you want to play?')
        .setRequired(true)
        .addChoices(...storyChoices)),

    new SlashCommandBuilder()
      .setName('answer')
      .setDescription('Submit your answer')
      .addStringOption(o => o.setName('text').setDescription('Your answer').setRequired(true))
      .addStringOption(o => o
        .setName('story')
        .setDescription('For which story? (optional if you only have one active)')
        .setRequired(false)
        .addChoices(...storyChoices)),

    new SlashCommandBuilder()
      .setName('hint')
      .setDescription('Ask for a hint')
      .addStringOption(o => o
        .setName('story')
        .setDescription('For which story? (optional if you only have one active)')
        .setRequired(false)
        .addChoices(...storyChoices)),

    new SlashCommandBuilder()
      .setName('myprogress')
      .setDescription('See your progress across all stories'),

    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('🔧 [ADMIN] Create all roles and channels')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),

    new SlashCommandBuilder()
      .setName('teardown')
      .setDescription('🔧 [ADMIN] Delete ALL escape-room channels & roles (then run /setup again)')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString())
      .addStringOption(o => o
        .setName('confirm')
        .setDescription('Type "yes" to confirm — this deletes channels and roles')
        .setRequired(true)),

    new SlashCommandBuilder()
      .setName('reset')
      .setDescription('🔧 [ADMIN] Reset a player')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString())
      .addUserOption(o => o.setName('player').setDescription('The player').setRequired(true))
      .addStringOption(o => o
        .setName('story')
        .setDescription('Reset which story? (empty = reset everything)')
        .setRequired(false)
        .addChoices(...storyChoices)),

    new SlashCommandBuilder()
      .setName('newstory')
      .setDescription('🔧 [ADMIN] Announce a new story to winners')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),

    new SlashCommandBuilder()
      .setName('serverprogress')
      .setDescription('🔧 [ADMIN] See everyone\'s progress')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  ].map(c => c.toJSON());
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(CONFIG.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID), { body: buildCommands() });
    console.log('✅ Slash commands registered');
  } catch (e) {
    console.error('❌ Command registration error:', e);
  }
}

// ────────────────────────────────────────────────────────────────
// 🤖  EVENTS
// ────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction);
  } catch (e) {
    console.error(e);
    // Respond safely whether or not we've already replied/deferred.
    const msg = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
    try {
      if (interaction.deferred) await interaction.editReply(msg);
      else if (interaction.replied) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch (_) { /* interaction expired — nothing else we can do */ }
  }
});

// ── Auto-delete free chat in escape-room channels ───────────────
// Discord can't allow slash commands while blocking typing, so we allow
// typing and simply remove any human message posted in a bot channel —
// EXCEPT the lounge. Slash-command replies are interactions, not messages,
// so they are never touched by this.
// Free chat is allowed ONLY in the lounge and the per-story "COMPLETED"
// channels (winners + hall-of-fame), so finishers can discuss the levels.
// Everywhere else in the escape-room channels, players may only run commands —
// any free-chat message is deleted.
function isManagedSilentChannel(ch) {
  const name = ch?.name ?? '';
  const parentName = ch?.parent?.name ?? '';

  // ── Channels where chatting IS allowed → never delete ──
  if (name === CONFIG.LOUNGE_NAME) return false;          // lounge
  if (name === CONFIG.LOG_NAME) return false;             // admin log
  if (/-winners$/.test(name) || /-hall-of-fame$/.test(name)) return false; // completed
  if (parentName.includes('COMPLETED')) return false;     // anything under a COMPLETED category

  // ── Channels where ONLY commands are allowed → delete free chat ──
  if (name === CONFIG.HUB_NAME) return true;
  if (/^answer-/.test(name)) return true;
  if (parentName.startsWith('🎮 ESCAPE ROOM')) return true;
  if (/ — L\d+$/.test(parentName)) return true;
  return false;
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;                 // ignore the bot's own messages
  if (!message.guild) return;                     // ignore DMs
  // Admins may type anywhere (e.g. to post puzzle content or moderate).
  if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return;
  if (!isManagedSilentChannel(message.channel)) return;
  await message.delete().catch(err =>
    console.error(`⚠️  Could not delete message in #${message.channel?.name}: ${err.message}. ` +
                  `Does the bot have the "Manage Messages" permission there?`));
});

// Never let an unhandled rejection kill the process.
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));

// ────────────────────────────────────────────────────────────────
// 💬  COMMAND HANDLERS
// ────────────────────────────────────────────────────────────────
async function handleCommand(interaction) {
  const { commandName, member, guild, channel } = interaction;

  // ── Channel restrictions (enforced in code; Discord permissions
  //    can't limit *which* command works in *which* channel) ───────
  // /startstory must be used in the hub.
  if (commandName === 'startstory' && channel?.name !== CONFIG.HUB_NAME) {
    return interaction.reply({
      content: `❌ Use \`/startstory\` in the **#${CONFIG.HUB_NAME}** channel.`,
      ephemeral: true,
    });
  }
  // /answer and /hint must be used in an answer channel (answer-<story>-l<level>).
  if ((commandName === 'answer' || commandName === 'hint') && !/^answer-/.test(channel?.name ?? '')) {
    return interaction.reply({
      content: '❌ Use this command in your **answer channel** (the `answer-…` channel for your current level).',
      ephemeral: true,
    });
  }

  // ── /startstory ──────────────────────────────────────────────
  if (commandName === 'startstory') {
    const storyId = interaction.options.getString('story');
    const story = getStory(storyId);
    if (!story) return interaction.reply({ content: '❌ Story not found.', ephemeral: true });

    const progress = getUserProgress(member);
    const existing = progress.find(p => p.story.id === storyId);

    if (existing) {
      const embed = new EmbedBuilder()
        .setColor(story.color ?? '#5865f2')
        .setTitle(`${story.emoji} ${story.name}`)
        .setDescription(`You're already playing this story!\n\n📍 Current level: **${existing.level.id} — ${existing.level.name}**\n\nHead to the Level ${existing.level.id} channels to keep playing.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const firstLevel = story.levels[0];
    const role = guild.roles.cache.find(r => r.name === makeRoleName(story.id, firstLevel.id));
    if (role) await member.roles.add(role).catch(console.error);

    const embed = new EmbedBuilder()
      .setColor(story.color ?? '#5865f2')
      .setTitle(`${story.emoji} ${story.name} — Started!`)
      .setDescription(`${story.description}\n\n**Your adventure begins now.** The Level 1 channels are now visible to you.\n\nUse \`/hint\` if you get stuck.`);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    await log(guild, `▶️ **${member.user.tag}** started story "${story.name}"`);
    return;
  }

  // ── /answer ──────────────────────────────────────────────────
  if (commandName === 'answer') {
    const input = interaction.options.getString('text').toLowerCase().trim();
    const storyId = interaction.options.getString('story');

    const progress = getUserProgress(member);
    if (progress.length === 0) {
      return interaction.reply({ content: '❌ You haven\'t started yet. Use `/startstory` to pick a story.', ephemeral: true });
    }

    let active = null;
    if (storyId) {
      active = progress.find(p => p.story.id === storyId);
      if (!active) return interaction.reply({ content: '❌ You\'re not active in that story. Use `/startstory` to begin it.', ephemeral: true });
    } else if (progress.length === 1) {
      active = progress[0];
    } else {
      const list = progress.map(p => `\`${p.story.id}\` — ${p.story.emoji} ${p.story.name} (Level ${p.level.id})`).join('\n');
      return interaction.reply({
        content: `You're playing several stories. Add the story option:\n${list}\n\nExample: \`/answer text:youranswer story:frequency\``,
        ephemeral: true,
      });
    }

    const { story, level } = active;
    const isCorrect = level.answers.some(a => a.toLowerCase() === input);

    if (!isCorrect) {
      await log(guild, `❌ **${member.user.tag}** wrong answer on ${story.name} L${level.id}: \`${input}\``);
      const embed = new EmbedBuilder()
        .setColor('#ed4245')
        .setTitle('❌ Wrong answer')
        .setDescription(`That's not right for **${story.name} — Level ${level.id}**.\n\nKeep looking, or use \`/hint\`.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ✅ Correct
    await interaction.deferReply({ ephemeral: true });

    const oldRole = guild.roles.cache.find(r => r.name === makeRoleName(story.id, level.id));
    if (oldRole) await member.roles.remove(oldRole).catch(console.error);

    const isFinale = level.id === story.levels.length;

    if (!isFinale) {
      const next = story.levels[level.id]; // levels array is 0-indexed, level.id is 1-indexed
      const newRole = guild.roles.cache.find(r => r.name === makeRoleName(story.id, next.id));
      if (newRole) await member.roles.add(newRole).catch(console.error);
    } else {
      const winnerRole = guild.roles.cache.find(r => r.name === makeWinnerRoleName(story.id));
      if (winnerRole) await member.roles.add(winnerRole).catch(console.error);

      const hof = guild.channels.cache.find(c => c.name === `${story.id}-hall-of-fame`);
      if (hof) {
        await hof.send({ embeds: [new EmbedBuilder()
          .setColor('#ffd700')
          .setTitle('🏆 Hall of Fame')
          .setDescription(`${member} fully completed **${story.name}**!`)
          .setTimestamp()] });
      }
    }

    await log(guild, `✅ **${member.user.tag}** completed ${story.name} L${level.id}`);

    const embed = new EmbedBuilder()
      .setColor('#57f287')
      .setTitle('✅ Correct!')
      .setDescription(level.successMessage)
      .setFooter({ text: isFinale ? `🏆 ${story.name} completed!` : `Head to the Level ${level.id + 1} channels` });
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /hint ────────────────────────────────────────────────────
  if (commandName === 'hint') {
    const storyId = interaction.options.getString('story');
    const progress = getUserProgress(member);

    if (progress.length === 0) {
      return interaction.reply({ content: '❌ You haven\'t started yet. Use `/startstory`.', ephemeral: true });
    }

    let active = null;
    if (storyId) {
      active = progress.find(p => p.story.id === storyId);
    } else if (progress.length === 1) {
      active = progress[0];
    } else {
      const list = progress.map(p => `\`${p.story.id}\` — ${p.story.emoji} ${p.story.name}`).join('\n');
      return interaction.reply({ content: `Several active stories:\n${list}\n\nExample: \`/hint story:frequency\``, ephemeral: true });
    }

    if (!active) return interaction.reply({ content: '❌ You\'re not active in that story.', ephemeral: true });

    const { story, level } = active;
    const hintIdx = getHint(member.id, story.id, level.id);

    if (hintIdx >= level.hints.length) {
      return interaction.reply({
        content: `😅 You've used all **${level.hints.length}** hints for this level. You'll have to figure out the rest yourself...`,
        ephemeral: true,
      });
    }

    incrementHint(member.id, story.id, level.id);

    const embed = new EmbedBuilder()
      .setColor('#ffa500')
      .setTitle(`💡 Hint — ${story.name} · Level ${level.id}`)
      .setDescription(level.hints[hintIdx])
      .setFooter({ text: `Hint ${hintIdx + 1} of ${level.hints.length} used` });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /myprogress ──────────────────────────────────────────────
  if (commandName === 'myprogress') {
    const progress = getUserProgress(member);
    const all = allStories();

    const completed = all.filter(s => {
      const role = guild.roles.cache.find(r => r.name === makeWinnerRoleName(s.id));
      return role && member.roles.cache.has(role.id);
    });

    const embed = new EmbedBuilder().setColor('#5865f2').setTitle('📍 Your progress');

    if (completed.length > 0) {
      embed.addFields({ name: '🏆 Completed', value: completed.map(s => `${s.emoji} ${s.name}`).join('\n') });
    }

    if (progress.length > 0) {
      embed.addFields({ name: '▶️ In progress', value: progress.map(p =>
        `${p.story.emoji} **${p.story.name}** — Level ${p.level.id}/${p.story.levels.length}: *${p.level.name}*`).join('\n') });
    }

    const notStarted = all.filter(s =>
      !progress.some(p => p.story.id === s.id) && !completed.some(v => v.id === s.id));
    if (notStarted.length > 0) {
      embed.addFields({ name: '⏸️ Not started yet', value: notStarted.map(s => `${s.emoji} ${s.name}`).join('\n') });
    }

    embed.setFooter({ text: 'Use /startstory to begin a new story' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /setup ───────────────────────────────────────────────────
  if (commandName === 'setup') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Admins only.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const messages = await runSetup(guild);
    return interaction.editReply({ content: messages.join('\n') + '\n\n🎉 **Setup complete!**' });
  }

  // ── /teardown ────────────────────────────────────────────────
  if (commandName === 'teardown') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Admins only.', ephemeral: true });
    }
    const confirm = interaction.options.getString('confirm').toLowerCase().trim();
    if (confirm !== 'yes') {
      return interaction.reply({ content: '❌ Cancelled. Type `confirm: yes` to actually delete everything.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const { channelsDeleted, rolesDeleted } = await runTeardown(guild);
    return interaction.editReply({
      content: `🧹 **Teardown complete.**\nDeleted **${channelsDeleted}** channels/categories and **${rolesDeleted}** roles.\n\nRun \`/setup\` for a clean rebuild.`,
    });
  }

  // ── /reset ───────────────────────────────────────────────────
  if (commandName === 'reset') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Admins only.', ephemeral: true });
    }
    const target = interaction.options.getMember('player');
    const storyId = interaction.options.getString('story');
    if (!target) return interaction.reply({ content: '❌ Player not found.', ephemeral: true });

    const stories = storyId ? [getStory(storyId)].filter(Boolean) : allStories();

    for (const story of stories) {
      for (const level of story.levels) {
        const role = guild.roles.cache.find(r => r.name === makeRoleName(story.id, level.id));
        if (role) await target.roles.remove(role).catch(() => {});
      }
      const winRole = guild.roles.cache.find(r => r.name === makeWinnerRoleName(story.id));
      if (winRole) await target.roles.remove(winRole).catch(() => {});
    }

    hintCounters.delete(target.id);
    await log(guild, `🔄 **${target.user.tag}** was reset by **${member.user.tag}**`);
    return interaction.reply({ content: `✅ Reset ${target}${storyId ? ` for story \`${storyId}\`` : ' (all stories)'}.`, ephemeral: true });
  }

  // ── /newstory ────────────────────────────────────────────────
  if (commandName === 'newstory') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Admins only.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const stories = allStories();
    let sent = 0;

    for (const story of stories) {
      const winRole = guild.roles.cache.find(r => r.name === makeWinnerRoleName(story.id));
      if (!winRole) continue;

      const lounge = guild.channels.cache.find(c => c.name === `${story.id}-winners`);
      if (!lounge) continue;

      const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('📡 New story available!')
        .setDescription(`${winRole} — a new adventure has been added to the server!\n\nUse \`/myprogress\` to see it and \`/startstory\` to begin.`)
        .setTimestamp();

      await lounge.send({ content: `${winRole}`, embeds: [embed] });

      const members = await guild.members.fetch();
      for (const [, m] of members) {
        if (!m.roles.cache.has(winRole.id)) continue;
        await m.send({ embeds: [new EmbedBuilder()
          .setColor('#ffd700')
          .setTitle('📻 New escape room story!')
          .setDescription('A new adventure is available on the server. Come back and play!')] }).catch(() => {});
      }
      sent++;
    }

    return interaction.editReply({ content: `✅ Notified winners across ${sent} stories.` });
  }

  // ── /serverprogress ──────────────────────────────────────────
  if (commandName === 'serverprogress') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Admins only.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const members = await guild.members.fetch();
    const embed = new EmbedBuilder().setColor('#5865f2').setTitle('📊 Server progress').setTimestamp();

    for (const story of allStories()) {
      const lines = [];
      for (const level of story.levels) {
        const role = guild.roles.cache.find(r => r.name === makeRoleName(story.id, level.id));
        const count = role ? members.filter(m => m.roles.cache.has(role.id)).size : 0;
        if (count > 0) lines.push(`L${level.id} *${level.name}*: **${count}** player(s)`);
      }
      const winRole = guild.roles.cache.find(r => r.name === makeWinnerRoleName(story.id));
      const winCount = winRole ? members.filter(m => m.roles.cache.has(winRole.id)).size : 0;
      if (winCount > 0) lines.push(`🏆 Completed: **${winCount}** player(s)`);

      embed.addFields({ name: `${story.emoji} ${story.name}`, value: lines.length ? lines.join('\n') : '*Nobody has started yet*' });
    }

    return interaction.editReply({ embeds: [embed] });
  }
}

// ────────────────────────────────────────────────────────────────
// 🚀  START
// ────────────────────────────────────────────────────────────────
client.login(CONFIG.BOT_TOKEN);
