# Fortnite Tournament Bot

A Discord bot for running Fortnite custom-lobby tournaments: players register with their
Epic name and region, admins post the creator code per region, and match results are
verified from a screenshot by AI before a human confirms them on a web dashboard.

---

## How a tournament runs

1. **Setup** — an administrator runs `/setup`. Until that wizard is finished, `/setup` is
   the *only* command the server has. Finishing it deploys every other command.
2. **Teams** — the wizard creates team roles (or links existing ones). Members join a team
   from a button panel; their points count for that team.
3. **Create** — `/tournament create name:"Summer Cup" regions:"EU, NAE, NAW"`.
4. **Open** — `/tournament status status:Open` announces registration.
5. **Register** — players run `/tournament join` with their exact Epic name and region.
6. **Play** — `/tournament code region:EU code:ABC-123` posts the creator code and pings
   everyone registered in that region.
7. **Submit** — after the match, players run `/submit` with their kills, whether they won,
   and their end-of-match screenshot. Staff can also submit for someone with `/admin-submit`.
8. **Review** — the AI reads the kills, the win banner and the Epic name from the image.
   Nothing scores until a human approves it on the dashboard or with `/review approve`.
9. **Standings** — `/leaderboard post` puts self-updating team and player boards in a
   channel. They refresh every minute and after every review.

---

## Commands

| Command | Who | What it does |
|---|---|---|
| `/setup` | Admin | The configuration wizard. Re-run it any time to change settings. |
| `/tournament create\|status\|code\|players` | Admin | Manage tournaments, regions and creator codes. |
| `/tournament join\|info\|list` | Everyone | Register and view tournaments. |
| `/team panel\|assign\|reset` | Admin | Post the join panel, move or reset members. |
| `/team list\|status` | Everyone | View teams and who is on them. |
| `/submit` | Everyone | Submit your own match result. |
| `/admin-submit` | Staff | Submit a result on behalf of a player. |
| `/review queue\|show\|approve\|reject\|remove\|logs\|dashboard` | Admin | Review submissions from Discord. |
| `/leaderboard teams\|players` | Everyone | View the standings. |
| `/leaderboard post` | Admin | Post the self-updating boards. |

---

## Web dashboard

Reachable at `/admin` on your bot's public URL. Sign in with `ADMIN_DASHBOARD_TOKEN`.

Tabs:

- **Pending** — everything awaiting a decision.
- **AI corrected** — submissions where a human overruled what the AI read. This is the
  accuracy audit trail.
- **Approved** / **Rejected** / **All**.

Each card shows the screenshot, the AI's verdict and confidence, and warnings when the AI
disagrees with the player or the Epic name on the screenshot does not match the registered
one. Kill count and win flag are pre-filled from the AI's reading and can be corrected
before approving.

Sessions are random ids stored server-side with a 12-hour expiry, and login is locked for
15 minutes after 5 failed attempts.

---

## Setup

### 1. Discord application

1. <https://discord.com/developers/applications> → **New Application**.
2. **Bot** → copy the token (`DISCORD_TOKEN`), enable the **Server Members Intent**.
3. **General Information** → copy the Application ID (`DISCORD_CLIENT_ID`).
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permissions
   **Manage Roles**, **Manage Channels**, **Send Messages**, **Embed Links**,
   **Attach Files**, **Read Message History**. Invite the bot.
5. Move the bot's role **above** every team role, or it cannot assign them.

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
| `NODE_ENV` | recommended | Set to `production` so cookies get the `Secure` flag. |
| `ADMIN_DASHBOARD_TOKEN` | for the dashboard | The code admins type to sign in. |
| `DASHBOARD_URL` | no | Public URL, used for the dashboard link in Discord. |
| `OPENROUTER_API_KEY` | no | AI verifier, tried first. |
| `GROQ_API_KEY` | no | AI verifier, tried second. |
| `GEMINI_API_KEY` | no | AI verifier, tried third. |
| `FORTNITE_API_KEY` | no | Optional; the public API works without it. |

Any one AI key is enough — the verifier tries the configured providers in order and moves
on if one fails. With no key at all, submissions simply go straight to manual review.

---

## Scoring

Points are configurable in `/setup` and default to:

```
points = kills × 1 + (win ? 10 : 0)
```

Only **approved** submissions score. Rejecting or removing a submission takes its points
back immediately. A player can hold at most one approved win per tournament, and the same
screenshot can never be submitted twice in a server — both are enforced by the database,
not by application code.

---

## Project structure

```
index.js                     ← entry point
app.js                       ← client, HTTP server, event wiring
deploy/deployCommands.js     ← setup-gated command registration
commands/<name>/<name>.js    ← one folder per command
utils/
  db.js                      ← single shared pool + full schema
  configStore.js             ← per-guild settings
  teamStore.js               ← teams and membership
  tournamentStore.js         ← tournaments, regions, registrations
  submissionStore.js         ← submissions and moderation log
  scoreStore.js              ← point aggregation
  leaderboards.js            ← embeds and live board refresh
  aiVerifier.js              ← multi-provider screenshot verification
  fortnite*.js               ← item shop and news feeds
  dashboard.js               ← the web dashboard
public/admin/                ← dashboard frontend
test/                        ← node:test suites
```

Component `customId`s follow `<commandName>:<action>[:<arg>]`. The first segment must
match a registered command name — that is how interactions are routed.

---

## Tests

```bash
npm test
```

Covers the point formula, AI normalisation and confidence thresholds, Fortnite shop and
news parsing, command shapes, and the rule that admin commands stay hidden.
