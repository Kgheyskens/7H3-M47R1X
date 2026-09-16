# Valorant Community Bot

A Discord bot for a Valorant community server: configurable welcome and goodbye messages,
a rules message with an optional accept-to-enter button, and self-assign roles for
competitive rank and the agents members main.

---

## How it works

1. **Setup** — an administrator runs `/setup`. Until that wizard is finished, `/setup` is
   the *only* command the server has. Finishing it deploys every other command.
2. **Welcome & goodbye** — turn each on, pick a channel, and write a message. Placeholders
   `{user}`, `{username}`, `{server}` and `{membercount}` get filled in automatically.
3. **Rules** — write the rules text and post it. Optionally require members to press
   **I agree** before they get a role — a simple gate for the rest of the server.
4. **Ranks & agents** — create the standard rank ladder (Iron → Radiant) and the full agent
   roster with one click each, grouped by class (Duelist, Controller, Initiator, Sentinel).
   Add or remove individual ranks any time — useful whenever Riot changes the tier list or
   ships a new agent. Post the panel and members pick their own rank and every agent they
   main from select menus.
5. **`/roles`** — a member can check what they currently have picked.
6. **`/agent`** — a random-agent roulette for when nobody can decide who to lock in.

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
commands/agent/agent.js      ← `/agent` random-agent roulette
utils/
  db.js                      ← single shared pool + schema
  configStore.js             ← per-guild settings
  selfRoles.js                ← rank/agent role CRUD
  welcomeGoodbye.js           ← welcome/goodbye message sending
  panelRender.js              ← rules message + roles panel embeds/components
  valorantData.js             ← default rank ladder and agent roster
test/                        ← node:test suites
scripts/                     ← doctor, smoke test, SQL validator
```

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
