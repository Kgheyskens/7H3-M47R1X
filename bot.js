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
  PermissionsBitField, REST, Routes, ChannelType, Partials,
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
  // ── Entry gate channels (visible to everyone, even before verifying) ──
  WELCOME_NAME: 'welcome',       // bot greets new members here
  RULES_NAME:   'rules',         // rules + ✅ reaction to gain access
  BUMP_NAME:    'bump',          // Disboard bump reminders
  // ── Roles ──
  MEMBER_ROLE:  'Member',        // granted after accepting the rules; unlocks the server
  BUMPER_ROLE:  'Bumper',        // opt-in: pinged when it's time to bump again
  // ── Disboard ──
  DISBOARD_ID:  '302050872383242240', // Disboard bot user id (for bump auto-detect)
  BUMP_INTERVAL_MS: 2 * 60 * 60 * 1000, // 2 hours
  GATE_CHECK: '✅',              // the reaction emoji used on the rules message
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
    GatewayIntentBits.GuildMessageReactions,
  ],
  // Partials let us receive reaction events on messages that aren't in the
  // cache (e.g. the rules message posted before the last restart).
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ────────────────────────────────────────────────────────────────
// 📊  STATE
// hintCounters: Map<userId, Map<"storyId-levelId", hintIndex>>
// ────────────────────────────────────────────────────────────────
const hintCounters = new Map();

// Bump reminder: one pending timer per guild, so we don't stack reminders.
const bumpTimers = new Map(); // Map<guildId, NodeJS.Timeout>

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

// Story difficulty badge (shown next to the story name). Maps the
// story's difficultyLabel to a coloured circle. Defaults to Medium.
const DIFF_EMOJI = {
  easy: '🟢', medium: '🟡', hard: '🔴', 'very hard': '⚫',
};
function diffBadge(story) {
  const label = story.difficultyLabel ?? 'Medium';
  const dot = DIFF_EMOJI[label.toLowerCase()] ?? '🟡';
  return `${dot} ${label}`;
}

// ────────────────────────────────────────────────────────────────
// 📜  GATE EMBEDS (welcome / rules / bump)
// ────────────────────────────────────────────────────────────────
function buildWelcomeEmbed(guild) {
  return new EmbedBuilder()
    .setColor('#57f287')
    .setTitle(`👋 Welcome to ${guild.name}!`)
    .setDescription(
      `Glad you found us. This is a **co-op escape-room server** — a growing collection of story-driven puzzle rooms you crack with ciphers, riddles and logic.\n\n` +
      `**What's inside, once you're in:**\n` +
      `• 🎮 **#escape-room-hub** — pick a story with \`/startstory\` and play at your own pace\n` +
      `• 🧩 Multiple stories from 🟢 Easy to 🔴 Hard, each with several levels\n` +
      `• 💬 **#lounge** — hang out and chat with other players (no spoilers!)\n` +
      `• 🏆 Per-story **winners** channels where finishers can finally talk answers\n` +
      `• 📣 **#bump** — help us grow by bumping the server\n\n` +
      `**One step first:** head to **#rules**, give them a read, and react with ✅ to accept. ` +
      `That unlocks the rest of the server. See you inside!`)
    .setFooter({ text: 'React ✅ in #rules to enter' });
}

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle('📜 Server Rules — react ✅ to accept and enter')
    .setDescription(
      `By reacting ✅ below you confirm you've read and agree to these rules. ` +
      `Accepting unlocks **#lounge**, **#escape-room-hub** and the rest of the server.\n\n` +
      `**1. Be respectful.** No harassment, hate speech, slurs or personal attacks. Treat everyone well.\n\n` +
      `**2. No NSFW or illegal content.** Keep it clean — text, images, links, names, all of it.\n\n` +
      `**3. No spam or self-promo.** No unsolicited ads, invites or DMs to members.\n\n` +
      `**4. 🚫 NO SPOILERS in #lounge.** Never post puzzle answers, solutions or strong hints in the lounge or any general channel. This is the big one — spoiling a room ruins it for everyone.\n\n` +
      `**5. Discuss answers only where it's allowed.** Once you **complete a room**, you may talk freely about that room's puzzles in **that room's winners channel** — never anywhere else.\n\n` +
      `**6. Don't cheat the bot.** No exploiting, no sharing answer lists, no alt-account shenanigans. Play it straight — that's the whole fun.\n\n` +
      `**7. Use the right channels.** Commands go in their channels; chit-chat goes in #lounge.\n\n` +
      `**8. Follow Discord's Terms of Service & Community Guidelines** at all times.\n\n` +
      `Staff have final say. Breaking these may cost you roles or access.`)
    .setFooter({ text: 'React ✅ to accept the rules and unlock the server' });
}

function buildBumpInfoEmbed() {
  return new EmbedBuilder()
    .setColor('#eb459e')
    .setTitle('📣 Help us grow — bump the server!')
    .setDescription(
      `We're listed on **Disboard**. Every **2 hours** anyone can bump us back to the top of the listings so more puzzle-lovers find us.\n\n` +
      `**How to bump:** type \`/bump\` right here in this channel. That's it.\n\n` +
      `I'll keep track of the cooldown and post here the moment we can bump again.\n\n` +
      `🔔 **Want a reminder ping?** React 🔔 below to grab the **@Bumper** role and I'll tag you when it's time. React again to remove it.`)
    .setFooter({ text: 'Disboard bumps every 2 hours · /bump' });
}

// ────────────────────────────────────────────────────────────────
// 📣  DISBOARD BUMP REMINDER
// When Disboard confirms a bump, we wait 2h then ping @Bumper in #bump.
// Disboard's success embed contains "Bump done" — we detect that.
// ────────────────────────────────────────────────────────────────
function isDisboardBumpSuccess(message) {
  // Disboard confirms via an embed. Match on the well-known phrase, with a
  // fallback to the description, so a minor wording change won't break it.
  const texts = [];
  for (const e of message.embeds ?? []) {
    if (e.description) texts.push(e.description);
    if (e.title) texts.push(e.title);
    for (const f of e.fields ?? []) { texts.push(f.name); texts.push(f.value); }
  }
  if (message.content) texts.push(message.content);
  const blob = texts.join('\n').toLowerCase();
  return blob.includes('bump done') || blob.includes('bumped');
}

async function handleDisboardMessage(message) {
  if (!isDisboardBumpSuccess(message)) return;
  const guild = message.guild;
  await log(guild, '📣 Disboard bump detected — reminder scheduled in 2h');
  scheduleBumpReminder(guild, CONFIG.BUMP_INTERVAL_MS);
}

function scheduleBumpReminder(guild, delayMs) {
  // Replace any existing timer so we always count from the latest bump.
  const existing = bumpTimers.get(guild.id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    bumpTimers.delete(guild.id);
    try {
      const bump = guild.channels.cache.find(
        c => c.name === CONFIG.BUMP_NAME && c.type === ChannelType.GuildText);
      if (!bump) return;
      const bumperRole = guild.roles.cache.find(r => r.name === CONFIG.BUMPER_ROLE);
      const mention = bumperRole ? `${bumperRole}` : '';
      await bump.send({
        content: mention,
        embeds: [new EmbedBuilder()
          .setColor('#eb459e')
          .setTitle('⏰ Time to bump again!')
          .setDescription('The 2-hour cooldown is up. Run `/bump` here to push us back to the top of Disboard. Thank you! 💜')],
      }).catch(() => {});
    } catch (e) {
      console.error('Bump reminder error:', e.message);
    }
  }, delayMs);

  // Don't let the timer keep the process alive on its own.
  if (timer.unref) timer.unref();
  bumpTimers.set(guild.id, timer);
}

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

  // ── 0. ENTRY GATE ────────────────────────────────────────────
  // New members must accept the rules (✅ react) before they can see
  // anything but #welcome and #rules. We do this with a "Member" role:
  //   • @everyone: denied ViewChannel on the real server (hub, lounge, bump…)
  //   • Member role: allowed ViewChannel
  //   • #welcome and #rules: visible to @everyone (read-only)
  // Reacting ✅ on the rules message grants the Member role (see the
  // messageReactionAdd listener), which reveals the rest of the server.
  const memberRole = await getOrCreateRole(guild, CONFIG.MEMBER_ROLE, '#57f287');
  const bumperRole = await getOrCreateRole(guild, CONFIG.BUMPER_ROLE, '#eb459e');

  // START HERE category — the ONLY thing an unverified member can see.
  const gateCat = await mkCategory('👋 START HERE', [
    {
      id: guild.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
      deny:  [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions],
    },
    ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AddReactions] }] : []),
  ]);

  // #welcome — bot greeting. Read-only for everyone.
  const welcome = await mkChannel(CONFIG.WELCOME_NAME, gateCat, 'Welcome! Start here.');
  const welcomeMsgs = await welcome.messages.fetch({ limit: 5 });
  if (welcomeMsgs.size === 0) {
    await welcome.send({ embeds: [buildWelcomeEmbed(guild)] });
  }

  // #rules — rules embed + ✅ reaction gate.
  const rules = await mkChannel(CONFIG.RULES_NAME, gateCat, 'Read and accept the rules to enter');
  const rulesMsgs = await rules.messages.fetch({ limit: 5 });
  let rulesMsg = rulesMsgs.find(m => m.author.id === client.user.id && m.embeds.length);
  if (!rulesMsg) {
    rulesMsg = await rules.send({ embeds: [buildRulesEmbed()] });
  }
  // Make sure our ✅ is on it so members have something to click.
  await rulesMsg.react(CONFIG.GATE_CHECK).catch(() => {});
  messages.push('✅ Welcome & Rules gate created');

  // Backfill: every CURRENT human member keeps access (new joiners don't).
  let granted = 0;
  const allMembers = await guild.members.fetch();
  for (const [, m] of allMembers) {
    if (m.user.bot) continue;
    if (!m.roles.cache.has(memberRole.id)) {
      await m.roles.add(memberRole).then(() => granted++).catch(() => {});
    }
  }
  messages.push(`✅ Member role granted to ${granted} existing member(s)`);

  // #bump — Disboard reminders. Part of the real server (Member-gated).
  const bumpCat = await mkCategory('📣 COMMUNITY', [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: memberRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages] },
    ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AddReactions] }] : []),
  ]);
  const bump = await mkChannel(CONFIG.BUMP_NAME, bumpCat, 'Bump the server on Disboard every 2 hours');
  const bumpMsgs = await bump.messages.fetch({ limit: 5 });
  let bumpOptIn = bumpMsgs.find(m => m.author.id === client.user.id && m.embeds.length);
  if (!bumpOptIn) {
    bumpOptIn = await bump.send({ embeds: [buildBumpInfoEmbed()] });
  }
  await bumpOptIn.react('🔔').catch(() => {});
  messages.push('✅ Bump channel created');

  // 1. Public hub category — now gated behind the Member role.
  //    NOTE: Discord requires BOTH SendMessages AND UseApplicationCommands for
  //    a user to run a slash command. So we must ALLOW SendMessages here, and
  //    instead keep the channel chat-free by auto-deleting any human message
  //    (see the messageCreate listener further down). The #lounge is exempt.
  const hubCat = await mkCategory('🎮 ESCAPE ROOM', [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: memberRole.id,
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
          .map(s => `${s.emoji} **${s.name}** — ${s.levels.length} levels · ${diffBadge(s)}\n*${s.description}*`)
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
    '👋 START HERE', '📣 COMMUNITY', // entry gate + bump
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
      name === CONFIG.WELCOME_NAME ||
      name === CONFIG.RULES_NAME ||
      name === CONFIG.BUMP_NAME ||
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

  // 3. Delete the bot's roles (level roles + winner roles, English + Dutch,
  //    plus the gate roles).
  for (const [, role] of guild.roles.cache) {
    const n = role.name;
    const isLevelRole   = /-L\d+$/.test(n);
    const isWinnerRole  = /-completed$/.test(n) || /-voltooid$/.test(n);
    const isGateRole    = n === CONFIG.MEMBER_ROLE || n === CONFIG.BUMPER_ROLE;
    if (isLevelRole || isWinnerRole || isGateRole) {
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
  // Same list, but with the difficulty shown — used for /startstory so
  // players can see how hard a story is before they pick it. (Discord
  // choice names cap at 100 chars; story names are short, so we're safe.)
  const startChoices = stories.map(s => {
    const dot = DIFF_EMOJI[(s.difficultyLabel ?? 'Medium').toLowerCase()] ?? '🟡';
    return { name: `${s.emoji} ${s.name} — ${dot} ${s.difficultyLabel ?? 'Medium'}`, value: s.id };
  });

  return [
    new SlashCommandBuilder()
      .setName('startstory')
      .setDescription('Pick a story to start or return to')
      .addStringOption(o => o
        .setName('story')
        .setDescription('Which story do you want to play?')
        .setRequired(true)
        .addChoices(...startChoices)),

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
  if (!message.guild) return;                     // ignore DMs

  // ── Disboard bump auto-detect ───────────────────────────────
  // Disboard posts an embed confirming a successful bump. When we see it
  // in #bump, start the 2-hour countdown and remind @Bumper afterwards.
  if (message.author.id === CONFIG.DISBOARD_ID && message.channel?.name === CONFIG.BUMP_NAME) {
    await handleDisboardMessage(message);
    return;
  }

  if (message.author.bot) return;                 // ignore other bots & ourselves
  // Admins may type anywhere (e.g. to post puzzle content or moderate).
  if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return;
  if (!isManagedSilentChannel(message.channel)) return;
  await message.delete().catch(err =>
    console.error(`⚠️  Could not delete message in #${message.channel?.name}: ${err.message}. ` +
                  `Does the bot have the "Manage Messages" permission there?`));
});

// ── New member joins → greet in #welcome, gate stays closed ─────
// They join with NO Member role, so they can only see #welcome + #rules
// until they react ✅ on the rules message.
client.on('guildMemberAdd', async member => {
  if (member.user.bot) return;
  const welcome = member.guild.channels.cache.find(
    c => c.name === CONFIG.WELCOME_NAME && c.type === ChannelType.GuildText);
  if (!welcome) return;
  await welcome.send({
    content: `${member} just arrived! 👋`,
    embeds: [new EmbedBuilder()
      .setColor('#57f287')
      .setDescription(
        `Welcome, ${member}! 🎉\n\n` +
        `Head to **#${CONFIG.RULES_NAME}**, read the rules, and react ✅ to unlock the server and start cracking rooms.`)],
  }).catch(() => {});
  await log(member.guild, `👋 **${member.user.tag}** joined the server`);
});

// ── Rules ✅ gate + Bumper 🔔 opt-in ────────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
  await handleGateReaction(reaction, user, true);
});
client.on('messageReactionRemove', async (reaction, user) => {
  await handleGateReaction(reaction, user, false);
});

async function handleGateReaction(reaction, user, added) {
  try {
    if (user.bot) return;
    // Resolve partials (reaction/message may not be cached).
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const msg = reaction.message;
    const guild = msg.guild;
    if (!guild) return;
    const channelName = msg.channel?.name;
    const emoji = reaction.emoji.name;

    // Rules ✅ → grant/remove the Member role.
    if (channelName === CONFIG.RULES_NAME && emoji === CONFIG.GATE_CHECK) {
      const role = guild.roles.cache.find(r => r.name === CONFIG.MEMBER_ROLE);
      if (!role) return;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      if (added) {
        await member.roles.add(role).catch(() => {});
        await log(guild, `✅ **${member.user.tag}** accepted the rules`);
      } else {
        // Un-reacting revokes access — sends them back to the gate.
        await member.roles.remove(role).catch(() => {});
        await log(guild, `↩️ **${member.user.tag}** withdrew rules acceptance`);
      }
      return;
    }

    // Bump 🔔 → toggle the Bumper reminder role.
    if (channelName === CONFIG.BUMP_NAME && emoji === '🔔') {
      const role = guild.roles.cache.find(r => r.name === CONFIG.BUMPER_ROLE);
      if (!role) return;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      if (added) await member.roles.add(role).catch(() => {});
      else await member.roles.remove(role).catch(() => {});
    }
  } catch (e) {
    console.error('Reaction handler error:', e.message);
  }
}

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
      .setDescription(`${story.description}\n\n**Difficulty:** ${diffBadge(story)}\n\n**Your adventure begins now.** The Level 1 channels are now visible to you.\n\nUse \`/hint\` if you get stuck.`);

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
