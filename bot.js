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
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
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
  // ── Tickets ──
  TICKETS_NAME:    'tickets',    // public panel channel (under 📣 COMMUNITY)
  TICKET_CATEGORY: '🎫 TICKETS', // admin-only category where ticket channels land
  // ── Leaderboard ──
  LEADERBOARD_NAME: 'leaderboard', // read-only board of who completed which rooms (under 📣 COMMUNITY)
  // ── Roles ──
  MEMBER_ROLE:  'Member',        // granted after accepting the rules; unlocks the server
  BUMPER_ROLE:  'Bumper',        // opt-in: pinged when it's time to bump again
  BUMPER_ROLE_ID: '1518533784050602094', // role ID for direct mention in embeds
  // ── Disboard ──
  DISBOARD_ID:  '302050872383242240', // Disboard bot user id (for bump auto-detect)
  BUMP_INTERVAL_MS: 2 * 60 * 60 * 1000, // 2 hours
  GATE_CHECK: '✅',              // the reaction emoji used on the rules message
  PORT:       process.env.PORT || 3000,
};

// Ticket categories. The button customId is `ticket_open_<key>`.
const TICKET_TYPES = {
  question: { emoji: '❓', label: 'Question',         style: ButtonStyle.Primary   },
  story:    { emoji: '💡', label: 'Story idea',       style: ButtonStyle.Success   },
  level:    { emoji: '🧩', label: 'Level/puzzle idea', style: ButtonStyle.Secondary },
  other:    { emoji: '📩', label: 'Other',            style: ButtonStyle.Secondary },
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

// ── Upsert a bot panel/content message ──────────────────────────
// Lets /setup REFRESH what it posted instead of only posting to empty
// channels — so editing a story, the hub list, a puzzle, or a panel and
// re-running /setup updates the message in place (no teardown needed).
//
// We locate the existing message by its embed TITLE, so we always edit the
// right panel and never touch unrelated bot posts in the same channel
// (e.g. #welcome join-greetings, or #bump "thanks for bumping" embeds).
// Untitled content embeds (lounge/puzzle/answer) are matched as the single
// titleless bot embed in their channel.
async function findBotPanel(channel, title) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return null;
  // Oldest-first so we edit the original panel, not a later duplicate.
  const mine = [...msgs.values()].reverse()
    .filter(m => m.author.id === client.user.id && m.embeds.length);
  if (title) return mine.find(m => m.embeds[0]?.title === title) ?? null;
  return mine.find(m => !m.embeds[0]?.title) ?? null;
}

async function upsertPanel(channel, embed, components) {
  const payload = { embeds: [embed], ...(components ? { components } : {}) };
  const existing = await findBotPanel(channel, embed.data?.title ?? null);
  if (existing) {
    await existing.edit(payload).catch(() => {});
    return existing;
  }
  return channel.send(payload).catch(() => null);
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
      `• 🧩 Multiple stories from Easy to Hard, each with several levels\n` +
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
// 🎫  TICKET PANEL
// A public channel with category buttons. Clicking one opens a private
// channel (opener + admins only) under the 🎫 TICKETS category.
// ────────────────────────────────────────────────────────────────
function buildTicketPanelEmbed() {
  const lines = Object.values(TICKET_TYPES)
    .map(t => `${t.emoji} **${t.label}**`)
    .join('\n');
  return new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle('🎫 Open a ticket')
    .setDescription(
      `Have a question, an idea for a new story or level/puzzle, or want to reach the team for ` +
      `any other reason? Click the button below that fits best.\n\n` +
      `A **private channel** will be created for you that only you and the team can see. ` +
      `Describe your question or idea there.\n\n` +
      `**Categories:**\n${lines}\n\n` +
      `_You can have one ticket open at a time. Done? Use the 🔒 button inside your ticket._`)
    .setFooter({ text: 'One ticket per person · the team will reply as soon as possible' });
}

function buildTicketButtons() {
  const row = new ActionRowBuilder();
  for (const [key, t] of Object.entries(TICKET_TYPES)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open_${key}`)
        .setLabel(t.label)
        .setEmoji(t.emoji)
        .setStyle(t.style));
  }
  return row;
}

// ────────────────────────────────────────────────────────────────
// 🏆  LEADERBOARD
// A read-only board showing who has completed which rooms. Completion is
// derived from the per-story winner roles (story-completed), so it needs no
// extra storage. Rendered as a monospace grid (rows = players ranked by rooms
// cleared, columns = stories) with a numbered legend, inside a code block so
// the columns line up. The top player's avatar is shown as the thumbnail.
// ────────────────────────────────────────────────────────────────
const RANK_MEDAL = ['🥇', '🥈', '🥉'];

async function buildLeaderboardEmbed(guild) {
  const stories = allStories();

  // Map each story to its winner role (may be missing if /setup not yet run).
  const cols = stories.map(s => ({
    story: s,
    role: guild.roles.cache.find(r => r.name === makeWinnerRoleName(s.id)) ?? null,
  }));

  const members = await guild.members.fetch();

  // Build [{ member, done:Set(storyId), count }] for everyone with ≥1 room.
  const rows = [];
  for (const [, m] of members) {
    if (m.user.bot) continue;
    const done = new Set();
    for (const c of cols) {
      if (c.role && m.roles.cache.has(c.role.id)) done.add(c.story.id);
    }
    if (done.size > 0) rows.push({ member: m, done, count: done.size });
  }
  rows.sort((a, b) =>
    b.count - a.count ||
    a.member.displayName.localeCompare(b.member.displayName));

  const embed = new EmbedBuilder()
    .setColor('#ffd700')
    .setTitle('🏆 Leaderboard — Completed Rooms')
    .setTimestamp();

  if (stories.length === 0) {
    return embed.setDescription('No stories are available yet.');
  }
  if (rows.length === 0) {
    embed.setDescription(
      'No rooms completed yet — be the first!\n\n' +
      'Finish every level of a story to earn your spot here.');
    embed.addFields({
      name: 'Rooms',
      value: stories.map((s, i) => `\`${i + 1}\` ${s.emoji} ${s.name}`).join('\n'),
    });
    return embed;
  }

  // Monospace grid — ASCII only so every column lines up (emojis aren't
  // fixed-width, so they'd break the grid; medals go in the podium line below).
  // Columns: rank · player name · one 2-char cell per story (legend number in
  // the header, "X"/"·" in each row).
  const RANK_W = 3;   // "#  ", "1  ", "12 "
  const NAME_W = 16;
  const fitName = (n) => (n.length > NAME_W - 1 ? n.slice(0, NAME_W - 2) + '…' : n).padEnd(NAME_W);

  const header =
    '#'.padEnd(RANK_W) + 'Player'.padEnd(NAME_W) +
    stories.map((_, i) => String(i + 1).padStart(2)).join(' ');
  const sep = '-'.repeat(header.length);

  const lines = [header, sep];
  const shown = rows.slice(0, 25);
  shown.forEach((r, idx) => {
    const rank = String(idx + 1).padEnd(RANK_W);
    const cells = stories.map(s => (r.done.has(s.id) ? ' X' : ' ·')).join(' ');
    lines.push(`${rank}${fitName(r.member.displayName)}${cells}`);
  });

  // Podium line (medals live here, outside the code block, so they don't
  // disturb the grid alignment).
  const podium = shown.slice(0, 3)
    .map((r, i) => `${RANK_MEDAL[i]} **${r.member.displayName}** (${r.count}/${stories.length})`)
    .join('   ');

  embed.setDescription(
    (podium ? podium + '\n' : '') +
    '```\n' + lines.join('\n') + '\n```');
  embed.addFields({
    name: 'Rooms',
    value: stories.map((s, i) => `\`${i + 1}\` ${s.emoji} ${s.name}`).join('\n'),
  });
  embed.setFooter({ text: `X = completed · ${rows.length} player(s) on the board` });

  const top = rows[0].member;
  const avatar = top.displayAvatarURL?.({ size: 128 });
  if (avatar) embed.setThumbnail(avatar);

  return embed;
}

// Refresh the leaderboard panel in #leaderboard, if that channel exists.
// Called after a story is completed and during /setup.
async function refreshLeaderboard(guild) {
  const ch = guild.channels.cache.find(
    c => c.name === CONFIG.LEADERBOARD_NAME && c.type === ChannelType.GuildText);
  if (!ch) return;
  const embed = await buildLeaderboardEmbed(guild);
  await upsertPanel(ch, embed);
}

// ────────────────────────────────────────────────────────────────
// 📣  DISBOARD BUMP REMINDER
// When Disboard confirms a bump, we wait 2h then ping @Bumper in #bump.
// Disboard's success embed contains "Bump done" — we detect that.
// ────────────────────────────────────────────────────────────────
function isDisboardBumpSuccess(message) {
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

function getBumper(message) {
  return message.interaction?.user ?? message.author ?? null;
}

async function handleDisboardMessage(message) {
  if (!isDisboardBumpSuccess(message)) return;
  const guild = message.guild;
  const bumper = getBumper(message);

  try {
    const bumpChannel = guild.channels.cache.find(
      c => c.name === CONFIG.BUMP_NAME && c.type === ChannelType.GuildText);
    if (bumpChannel) {
      const userMention = bumper ? `<@${bumper.id}>` : 'someone';
      await bumpChannel.send({
        embeds: [new EmbedBuilder()
          .setColor('#57f287')
          .setTitle('✅ Thanks for bumping!')
          .setDescription(`Thanks ${userMention} for the bump! 💜\nI'll ping <@&${CONFIG.BUMPER_ROLE_ID}> in 2 hours.`)],
      });
    }
  } catch (e) {
    console.error('Bump confirm error:', e.message);
  }

  await log(guild, '📣 Disboard bump detected — reminder scheduled in 2h');
  scheduleBumpReminder(guild, CONFIG.BUMP_INTERVAL_MS);
}

function scheduleBumpReminder(guild, delayMs) {
  const existing = bumpTimers.get(guild.id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    bumpTimers.delete(guild.id);
    try {
      const bump = guild.channels.cache.find(
        c => c.name === CONFIG.BUMP_NAME && c.type === ChannelType.GuildText);
      if (!bump) return;
      await bump.send({
        content: `<@&${CONFIG.BUMPER_ROLE_ID}>`,
        embeds: [new EmbedBuilder()
          .setColor('#eb459e')
          .setTitle('⏰ Time to bump again!')
          .setDescription('The 2-hour cooldown is up. Run `/bump` here to push us back to the top of Disboard. Thank you! 💜')],
      }).catch(() => {});
    } catch (e) {
      console.error('Bump reminder error:', e.message);
    }
  }, delayMs);

  if (timer.unref) timer.unref();
  bumpTimers.set(guild.id, timer);
}

// ────────────────────────────────────────────────────────────────
// 🏗️  SETUP — builds every channel & role for every story
// ────────────────────────────────────────────────────────────────
async function runSetup(guild) {
  const messages = ['⚙️ Setup started...'];
  const botRole = guild.members.me?.roles.highest;

  // Create the category, or — if it already exists — re-apply its permission
  // overwrites so re-running /setup heals any permission drift (this is what
  // keeps hidden categories like hall-of-fame actually hidden over time).
  async function mkCategory(name, overwrites) {
    const existing = guild.channels.cache.find(c => c.name === name && c.type === ChannelType.GuildCategory);
    if (existing) {
      await existing.permissionOverwrites.set(overwrites, 'Escape Room — sync permissions').catch(() => {});
      return existing;
    }
    return guild.channels.create({
      name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'Escape Room',
    });
  }

  async function mkChannel(name, parent, topic, contentToSend) {
    let ch = guild.channels.cache.find(c => c.name === name && c.parentId === parent.id);
    if (!ch) {
      ch = await guild.channels.create({
        name, type: ChannelType.GuildText, parent: parent.id, topic: topic ?? '', reason: 'Escape Room',
      });
    }
    if (contentToSend) {
      // Upsert the content embed so editing a story/level and re-running
      // /setup refreshes the text in place instead of leaving the old copy.
      await upsertPanel(ch, new EmbedBuilder().setColor('#2b2d31').setDescription(contentToSend));
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

  // #welcome — bot greeting. Read-only for everyone. Upserted so edits to the
  // welcome embed refresh on the next /setup. (The per-member join greetings
  // have no embed title match, so they're never touched.)
  const welcome = await mkChannel(CONFIG.WELCOME_NAME, gateCat, 'Welcome! Start here.');
  await upsertPanel(welcome, buildWelcomeEmbed(guild));

  // #rules — rules embed + ✅ reaction gate. Upserted so rule edits refresh.
  const rules = await mkChannel(CONFIG.RULES_NAME, gateCat, 'Read and accept the rules to enter');
  const rulesMsg = await upsertPanel(rules, buildRulesEmbed());
  // Make sure our ✅ is on it so members have something to click.
  if (rulesMsg) await rulesMsg.react(CONFIG.GATE_CHECK).catch(() => {});
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
    { id: memberRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages], deny: [PermissionsBitField.Flags.MentionEveryone] },
    ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AddReactions] }] : []),
  ]);
  const bump = await mkChannel(CONFIG.BUMP_NAME, bumpCat, 'Bump the server on Disboard every 2 hours');
  // Matched by the info embed's title, so bump-confirmation/reminder posts in
  // the same channel are never edited.
  const bumpOptIn = await upsertPanel(bump, buildBumpInfoEmbed());
  if (bumpOptIn) await bumpOptIn.react('🔔').catch(() => {});
  messages.push('✅ Bump channel created');

  // #tickets — the public panel. Members open tickets via buttons, so we deny
  // SendMessages for members here (button clicks are interactions, not messages)
  // to keep the panel channel clean. The bot may still post the panel.
  const tickets = await mkChannel(CONFIG.TICKETS_NAME, bumpCat, 'Open a ticket for questions or ideas');
  await tickets.permissionOverwrites.edit(memberRole.id, {
    ViewChannel: true, ReadMessageHistory: true, SendMessages: false,
  }).catch(() => {});
  await upsertPanel(tickets, buildTicketPanelEmbed(), [buildTicketButtons()]);
  messages.push('✅ Tickets panel created');

  // #leaderboard — read-only board of completed rooms (under 📣 COMMUNITY).
  // Members can view but not type (no SendMessages); the bot maintains one
  // embed it refreshes on completions and on /setup.
  const leaderboard = await mkChannel(CONFIG.LEADERBOARD_NAME, bumpCat, 'Who has completed which rooms');
  await leaderboard.permissionOverwrites.edit(memberRole.id, {
    ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false,
  }).catch(() => {});
  // Non-critical: never let a board-render error abort the whole setup.
  await refreshLeaderboard(guild).catch(e => console.error('Leaderboard render failed:', e.message));
  messages.push('✅ Leaderboard created');

  // 🎫 TICKETS category — admin-only. Per-ticket channels are created here at
  // runtime when a member clicks a panel button. Mirrors the ⚙️ ADMIN overwrites:
  // hidden from @everyone; admins see it via the Administrator permission.
  await mkCategory(CONFIG.TICKET_CATEGORY, [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageChannels] }] : []),
  ]);
  messages.push('✅ Tickets category created');

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
      deny: [PermissionsBitField.Flags.MentionEveryone],
    },
    ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }] : []),
  ]);

  const hub = await mkChannel(CONFIG.HUB_NAME, hubCat, 'Pick a story and start your adventure');
  // Rebuilt and upserted every run, so adding/renaming a story refreshes the
  // hub list in place on the next /setup.
  const hubEmbed = new EmbedBuilder()
    .setColor('#2b2d31')
    .setTitle('🎮 Escape Room — Choose your adventure')
    .setDescription(
      'Welcome. Several stories are waiting for you.\n\n' +
      'Use `/startstory` to begin. You can play multiple stories at once.\n\n' +
      allStories()
        .map(s => `${s.emoji} **${s.name}** — ${s.levels.length} levels`)
        .join('\n\n'))
    .setFooter({ text: '/startstory · /answer · /hint · /myprogress' });
  await upsertPanel(hub, hubEmbed);
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
          deny: [PermissionsBitField.Flags.MentionEveryone],
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
        deny: [PermissionsBitField.Flags.MentionEveryone],
      },
      ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }] : []),
    ]);
    await mkChannel(`${story.id}-winners`, winCat, `Winners of ${story.name}`);
    const hof = await mkChannel(`${story.id}-hall-of-fame`, winCat, `Hall of Fame — ${story.name}`);
    // Belt-and-braces: give the channel its OWN overwrites so it stays hidden
    // even if the category's inherited perms ever drift. Read-only for winners.
    await hof.permissionOverwrites.set([
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: winnerRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages] },
      ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }] : []),
    ], 'Escape Room — hall of fame visibility').catch(() => {});

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
    '👋 START HERE', '📣 COMMUNITY', // entry gate + bump + tickets + leaderboard
    '🎫 TICKETS',               // ticket channels category
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
      name === CONFIG.LEADERBOARD_NAME ||
      name === CONFIG.TICKETS_NAME ||
      /^ticket-/.test(name) ||
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
  if (interaction.isButton()) {
    try {
      await handleButton(interaction);
    } catch (e) {
      console.error(e);
      const msg = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
      try {
        if (interaction.deferred) await interaction.editReply(msg);
        else if (interaction.replied) await interaction.followUp(msg);
        else await interaction.reply(msg);
      } catch (_) { /* interaction expired */ }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction);
  } catch (e) {
    console.error(e);
    // Surface the real error to admins so setup/teardown failures are
    // diagnosable; everyone else gets the generic message.
    const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
    const detail = isAdmin && e?.message ? `\n\`\`\`${String(e.message).slice(0, 1800)}\`\`\`` : '';
    const msg = { content: `❌ Something went wrong. Please try again.${detail}`, ephemeral: true };
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
  if (name === CONFIG.BUMP_NAME) return true;             // only /bump; free text removed
  if (name === CONFIG.LEADERBOARD_NAME) return true;      // bot-only board; no chatting
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
// 🎫  TICKET BUTTON HANDLERS
// ────────────────────────────────────────────────────────────────
// We stash the opener's id in the channel topic ("opener:<id>") so the
// 1-ticket limit and the close-permission check survive bot restarts with
// no extra state — same "derive everything from Discord" approach the rest
// of the bot uses.
function ticketOpenerId(channel) {
  const m = /opener:(\d+)/.exec(channel?.topic ?? '');
  return m ? m[1] : null;
}

async function handleButton(interaction) {
  const { customId, guild } = interaction;
  if (!guild) return;

  // ── Open a ticket ──────────────────────────────────────────────
  if (customId.startsWith('ticket_open_')) {
    const typeKey = customId.slice('ticket_open_'.length);
    const type = TICKET_TYPES[typeKey];
    if (!type) {
      return interaction.reply({ content: '❌ Unknown ticket category.', ephemeral: true });
    }

    const cat = guild.channels.cache.find(
      c => c.name === CONFIG.TICKET_CATEGORY && c.type === ChannelType.GuildCategory);
    if (!cat) {
      return interaction.reply({
        content: '❌ The ticket system isn\'t set up yet. Ask an admin to run `/setup`.',
        ephemeral: true,
      });
    }

    // Enforce one open ticket per member.
    const existing = guild.channels.cache.find(
      c => c.parentId === cat.id && ticketOpenerId(c) === interaction.user.id);
    if (existing) {
      return interaction.reply({
        content: `❗ You already have an open ticket: ${existing}. Close that one first before opening a new one.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const botRole = guild.members.me?.roles.highest;
    const safeName = (interaction.user.username || 'member')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'member';

    const channel = await guild.channels.create({
      name: `ticket-${safeName}`,
      type: ChannelType.GuildText,
      parent: cat.id,
      topic: `Ticket • ${type.label} • opener:${interaction.user.id}`,
      reason: `Ticket opened by ${interaction.user.tag}`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        ...(botRole ? [{ id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageChannels] }] : []),
      ],
    });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger));

    await channel.send({
      content: `${interaction.user}`,
      embeds: [new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle(`${type.emoji} New ticket — ${type.label}`)
        .setDescription(
          `Welcome ${interaction.user}! 👋\n\n` +
          `Describe your **${type.label.toLowerCase()}** here. Give as much detail as you can — ` +
          `the team is reading along and will reply as soon as possible.\n\n` +
          `Done or resolved? Click **🔒 Close ticket** below.`)],
      components: [closeRow],
    });

    await log(guild, `🎫 **${interaction.user.tag}** opened a ticket (${type.label}) — ${channel}`);
    return interaction.editReply({ content: `✅ Your ticket has been created: ${channel}` });
  }

  // ── Close a ticket ─────────────────────────────────────────────
  if (customId === 'ticket_close') {
    const channel = interaction.channel;
    const openerId = ticketOpenerId(channel);
    const isOpener = openerId === interaction.user.id;
    const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
    if (!isOpener && !isAdmin) {
      return interaction.reply({ content: '❌ Only the ticket opener or an admin can close this ticket.', ephemeral: true });
    }

    await interaction.reply({ content: '🔒 Closing ticket… this channel will disappear in a few seconds.' });
    await log(guild, `🔒 Ticket ${channel?.name} closed by **${interaction.user.tag}**`);
    setTimeout(() => { channel?.delete('Ticket closed').catch(() => {}); }, 3000);
    return;
  }
}

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

      // New room cleared → update the public leaderboard.
      await refreshLeaderboard(guild).catch(() => {});
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
    await refreshLeaderboard(guild).catch(() => {});
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
