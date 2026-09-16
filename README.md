# Valorant Community Bot

A Discord bot for a Valorant community server: configurable welcome and goodbye messages,
a rules message with an optional accept-to-enter button, self-assign roles for competitive
rank and the agents members main (kept in sync automatically as Riot ships new agents), and
an optional news feed.

---

## How it works

1. **Setup** — an administrator runs `/setup`. Until that wizard is finished, `/setup` is
   the *only* command the server has. Finishing it deploys every other command.
2. **Welcome & goodbye** — turn each on, pick a channel, and write a message. Placeholders
   `{user}`, `{username}`, `{server}` and `{membercount}` get filled in automatically —
   `{membercount}` counts only human members, not bots/apps.
3. **Rules** — write the rules text (as long as you need — see below) and post it.
   Optionally require members to press **I agree** before they get a role — a simple gate
   for the rest of the server.
4. **Ranks & agents** — create the standard rank ladder (Iron 1 → Radiant, 3 divisions per
   tier except Radiant — 25 roles, exactly Discord's per-menu limit) and the full agent
   roster with one click each, grouped by class (Duelist, Controller, Initiator, Sentinel).
   Add or remove individual ranks any time — useful whenever Riot changes the tier list.
   **Post role panel** posts one message to pick a rank and one more per agent class (up to
   5 separate messages total) so each choice reads clearly instead of one crowded message —
   members pick their rank and every agent they main from select menus.
5. **Agents stay current on their own** — the agent roster is pulled from the live
   [valorant-api.com](https://valorant-api.com) agent list, not a hardcoded snapshot. Every
   12 hours (and once at startup) the bot checks for any agent that doesn't have a role yet,
   creates it, updates the relevant panel message in place, and drops a "new agent added"
   note in the panel channel. A **Sync agents now** button in `/setup` does the same thing
   on demand.
6. **News feed** — point the bot at any RSS or Atom feed (official Valorant news, a fan
   site, esports coverage, whatever) and it posts new articles to a channel every 15
   minutes, with an optional role ping on the first article of each batch.
7. **`/roles`** — a member can check what they currently have picked.
8. **`/agent`** — rolls a random pick from *the agents that member has selected* on the
   panel, not the whole roster — it never suggests an agent they don't main. If they haven't
   picked any yet (optionally within the given class), it says so instead of guessing.

---

## Commands

| Command | Who | What it does |
|---|---|---|
| `/setup` | Admin | The configuration wizard. Re-run it any time to change settings. |
| `/roles` | Everyone | View your current rank and agent pool. |
| `/agent [class]` | Everyone | Get a random agent suggestion, optionally limited to one class. |

Admin commands carry `default_member_permissions: Administrator`, so Discord hides them
from members entirely.

The actual rank/agent selection and rules acceptance happen on the panels `/setup` posts,
via select menus and a button — there's no separate command for those.

---

## Setup

### 1. Discord application

1. <https://discord.com/developers/applications> → **New Application**.
2. **Bot** → copy the token (`DISCORD_TOKEN`), enable the **Server Members Intent**
   (required to welcome/goodbye members and assign roles).
3. **General Information** → copy the Application ID (`DISCORD_CLIENT_ID`).
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permissions
   **Manage Roles**, **Send Messages**, **Embed Links**. Invite the bot.
5. Move the bot's role **above** every rank/agent role, or it cannot assign them.

### 2. Database

Any PostgreSQL instance works (Neon, Supabase, Render, local). Put the connection string in
`DATABASE_URL`. The schema is created automatically on first use — there is nothing to run
by hand. For a local Postgres without TLS, set `DATABASE_SSL=false`.

### 3. Environment

Copy `.env.example` to `.env` and fill it in. See the table below.

### 4. Run

```bash
npm install
npm start
```

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | **yes** | Bot token. The process exits without it. |
| `DISCORD_CLIENT_ID` | **yes** | Needed to register slash commands. |
| `DISCORD_GUILD_ID` | recommended | Your server id. |
| `DATABASE_URL` | **yes** | PostgreSQL connection string. |
| `DATABASE_SSL` | no | Set to `false` for a local Postgres without TLS. |
| `PORT` | no | HTTP port, defaults to `3000`. |
| `NODE_ENV` | recommended | Set to `production` when deployed. |

---

## Hosting (Render + UptimeRobot)

This bot is built to run on [Render](https://render.com) as a background/web service.
Render's free and hobby tiers spin a service down after a period of inactivity, so the bot
runs a tiny HTTP server (see `app.js`) that answers `OK` on `/`. Point an
[UptimeRobot](https://uptimerobot.com) monitor at the service's public Render URL on an
interval shorter than Render's idle timeout to keep the bot awake.

---

## Project structure

```
index.js                     ← entry point
app.js                       ← client, HTTP server, event wiring
deploy/deployCommands.js     ← setup-gated command registration
commands/setup/setup.js      ← the configuration wizard
commands/roles/roles.js      ← self-assign role interactions (`/roles` + the panels)
commands/agent/agent.js      ← `/agent` random pick from your own agents
utils/
  db.js                      ← single shared pool + schema
  configStore.js             ← per-guild settings
  selfRoles.js               ← rank/agent role CRUD
  welcomeGoodbye.js          ← welcome/goodbye message sending
  panelRender.js             ← rules message + roles panel embeds/components (length-bounded)
  valorantData.js            ← default rank ladder + offline agent fallback
  valorantApi.js             ← live agent roster from valorant-api.com
  agentSync.js               ← creates roles for newly released agents
  newsFeed.js                ← generic RSS/Atom feed poster
  actionLock.js              ← per-guild mutex so a double-click can't create duplicate roles
  roleDedupe.js              ← merges roles that already got duplicated back to one
  rolePanel.js               ← posts/edits the separate rank + per-class agent messages
  text.js                    ← boundedJoin / chunkText / truncate string helpers
test/                        ← node:test suites
scripts/                     ← doctor, smoke test, SQL validator
```

### Long rules text

A single Discord modal field caps at 4000 characters — that's Discord's own limit, not this
bot's. The rules editor in `/setup` uses 3 such fields (so up to 12,000 characters of input),
joined back together and stored as one string with no length limit of its own. On the
display side, an embed description caps at 4096 characters, so `panelRender.js` splits long
rules text across multiple embeds in the same message (up to 10 are allowed) rather than
truncating it.

### Duplicate roles

Clicking a bulk role-creation button twice in quick succession (or Discord redelivering a
slow interaction) used to be able to create the same rank or agent role twice, since both
clicks would see the "not created yet" state at the same time. `actionLock.js` now
serializes every bulk role action per guild, `roleDedupe.js` prevents new duplicates from
outrunning the same-name check, and **Clean up duplicates** in `/setup` → Ranks & agents
retroactively merges any that already exist — the oldest role survives, members on a
duplicate are moved onto it, and the extra roles are deleted.

Component `customId`s follow `<commandName>:<action>[:<arg>]`. The first segment must
match a registered command name — that is how interactions are routed. Panels posted by
`/setup` (the rules message and the roles panel) use the `roles:` prefix so `/roles`
handles the resulting button/select interactions even though `/setup` posted them.

---

## Tests

```bash
npm test              # unit tests
npm run validate-sql  # parses every SQL statement with the real Postgres grammar
npm run smoke         # setup/config/self-role flow against an in-memory Postgres
npm run doctor        # checks your environment is ready to run the bot
```
