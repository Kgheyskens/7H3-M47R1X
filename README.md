# 🎙️ Escape Room Bot — Multi-Story Edition

A Discord bot that runs text-based escape room stories. Each story is a series of
levels; solving a level unlocks the next set of channels. Players can play several
stories at once, and the whole server (channels + roles) is built for you by a single
`/setup` command.

---

## 📁 Project structure

```
bot.js                       ← the bot (commands, setup, keepalive server)
data/
  index.js                   ← auto-loads every story file
  stories/
    _TEMPLATE.js             ← copy this to make a new story (ignored by the loader)
    forgotten-frequency.js   ← Story 1 (10 levels)
    hollow-lighthouse.js     ← Story 2 (5 levels)
.env.example                 ← which secrets you need
package.json
```

**Key idea:** to add a story you just drop a new `.js` file in `data/stories/`.
The bot finds it automatically on startup. Files starting with `_` are ignored
(so the template never loads as a real story).

---

## 🚀 First-time setup

### 1. Create the Discord application
1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Add Bot** → copy the **Token** (this is `BOT_TOKEN`).
3. **Bot** tab → enable these **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`,
   bot permissions: **Administrator** (simplest — it creates roles/channels).
   Open the generated URL and invite the bot to your server.
5. **General Information** tab → copy the **Application ID** (this is `CLIENT_ID`).
6. In Discord, enable Developer Mode (User Settings → Advanced), right-click your
   server icon → **Copy Server ID** (this is `GUILD_ID`).

### 2. Environment variables
Copy `.env.example` to `.env` and fill it in:

```
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_server_id_here
```

> ⚠️ On Render you do **not** create a `.env` file — you add these as
> **Environment Variables** in the dashboard instead (see below).

### 3. Run locally
```bash
npm install
npm start
```
Then in your Discord server run **`/setup`** (as an admin) to build all channels and roles.

---

## ☁️ Hosting on Render + UptimeRobot (keep it always online)

### Why your bot kept going offline
Render **Web Services** require the app to open a network port. A plain Discord bot
doesn't open one, so Render logged *"No open ports detected"* and eventually killed it.
This bot now starts a tiny HTTP server (see `bot.js`, the "KEEPALIVE WEB SERVER" block)
that listens on `process.env.PORT`. That:
1. makes Render happy (a port is open), and
2. gives UptimeRobot a URL to ping so the free instance never sleeps.

### Render configuration
- **Type:** Web Service
- **Build Command:** `npm install`
- **Start Command:** `node bot.js`
- **Environment Variables:** add `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`
  (Render sets `PORT` automatically — don't add it yourself.)

After it deploys, open your service URL (e.g. `https://your-app.onrender.com`).
You should see: `Escape Room Bot is alive ✅`.

### UptimeRobot
1. Create a free account at <https://uptimerobot.com>.
2. **Add New Monitor** → **Monitor Type: HTTP(s)**.
3. **URL:** your Render URL (e.g. `https://your-app.onrender.com`).
4. **Monitoring Interval:** 5 minutes.
5. Save. UptimeRobot now pings the bot every 5 minutes, keeping it awake.

> Note: Render's free tier still has a monthly hours cap. UptimeRobot prevents the
> *idle-sleep*, but won't bypass a hard monthly limit if you hit it.

---

## 🎮 Commands

### For players
| Command | What it does | Where |
|---|---|---|
| `/startstory` | Pick a story and begin (unlocks its Level 1 channels). | `#escape-room-hub` only |
| `/answer` | Submit an answer. If you're in several stories, add the `story` option. | the `answer-…` channel for your level |
| `/hint` | Get the next hint for your current level (limited per level). | the `answer-…` channel for your level |
| `/myprogress` | See every story: completed, in progress, not started. | anywhere you can run commands |

> **Channel rules:** Discord requires a user to have *Send Messages* to run any
> slash command, so escape-room channels allow typing — but the bot instantly
> deletes any free-chat message players post there, keeping the channels clean.
> **#lounge** is exempt (free chat allowed). Admins can type anywhere.
> The admin commands below are hidden from non-admins entirely.
>
> Note: Discord does not let a bot hide a *player* command (like `/answer`) from
> the command list in specific channels — that needs a server admin to set it
> manually under **Server Settings → Integrations**. The bot instead politely
> rejects a command used in the wrong channel with an ephemeral message.

### For admins
| Command | What it does |
|---|---|
| `/setup` | Build every role + channel for every story (incl. the public **#lounge**). Safe to run again; it skips what already exists. |
| `/teardown` | Delete ALL escape-room channels and roles (requires `confirm: yes`). Use it to wipe duplicates, then run `/setup` for a clean rebuild. |
| `/reset` | Reset a player (one story or all). |
| `/newstory` | Announce a new story to everyone who already finished one. |
| `/serverprogress` | See how many players are on each level. |

> Run `/setup` again any time you add a new story — it only creates what's missing.

---

## ✍️ Adding your own story (the fun part)

1. **Copy the template:**
   ```bash
   cp data/stories/_TEMPLATE.js data/stories/sunken-city.js
   ```
   (On Windows PowerShell: `Copy-Item data/stories/_TEMPLATE.js data/stories/sunken-city.js`)

2. **Edit `sunken-city.js`.** The template is fully commented, but the essentials:
   - `id` — unique, lowercase, no spaces (used in role names).
   - `name`, `description`, `emoji`, `color` (6-digit hex like `#9b59b6`).
   - `levels` — an array; each level has `id` (1,2,3…), `name`, `difficulty` (1-5),
     `channels` (the story rooms), `answers` (every accepted spelling),
     `hints` (revealed one at a time), and `successMessage`.
   - The **last level** is automatically the finale (grants the winner role +
     Hall of Fame post). No extra config.

3. **Restart the bot**, then run **`/setup`** in Discord. Done — the new story's
   roles and channels appear automatically and it shows up in `/startstory`.

### Tips for good puzzles
- Put the clue in one channel and the "key" to read it in another — it makes players explore.
- Accept multiple spellings in `answers` (e.g. `['53', 'fifty three', 'fifty-three']`).
- Order `hints` from a gentle nudge to almost-the-answer.
- A meta-puzzle (collecting one letter per level into a final word) makes a satisfying finale —
  see the last level of `forgotten-frequency.js` for an example.

---

## 🛠️ Troubleshooting

- **Commands don't show up:** they register per-guild on startup; give it a few seconds,
  then fully close and reopen Discord. Check the logs for `✅ Slash commands registered`.
- **Bot can't create channels/roles:** make sure the bot's role is high in the role list
  and has Administrator (or at least Manage Roles + Manage Channels).
- **"No open ports detected" on Render:** make sure Start Command is `node bot.js` and you
  did not override `PORT`. The keepalive server handles this.
- **Color errors:** always use 6-digit hex (`#5865f2`), never 3-digit (`#55f`).
```

---

_Built with discord.js v14 · KgWorks_
