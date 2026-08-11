# Testing guide

Work through this top to bottom. Each stage is checkable on its own, so when something
breaks you know exactly which piece is at fault.

Run `npm run doctor` after every configuration change — it tells you what is still missing.

---

## Stage 0 — What runs without any setup

These need nothing but `npm install`:

```bash
npm test              # 13 unit tests: scoring, AI parsing, shop/news parsing
npm run validate-sql  # parses all 70 SQL statements with the real Postgres grammar
npm run smoke         # 17 dashboard checks against an in-memory Postgres
npm run smoke:flow    # 30 checks: setup gate → teams → tournament → approval → standings
npm run doctor        # tells you what is still missing
```

If these pass, the logic is sound. Everything below tests the integration.

> The two smoke tests run on pg-mem, which does not emulate everything real Postgres does
> (aggregate `FILTER`, and `RETURNING` on a losing `ON CONFLICT DO NOTHING`). Where that
> bites, the assertions say so. Those paths are covered by `validate-sql` and Stage 8.

---

## Stage 1 — Database (15 minutes, free)

Pick **one**:

### Option A — Neon (recommended, no install)

1. <https://neon.tech> → sign up → **Create project**.
2. Copy the connection string (looks like
   `postgres://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`).
3. Put it in `.env` as `DATABASE_URL=`.

### Option B — Supabase

<https://supabase.com> → new project → **Project Settings → Database → Connection string
→ URI**. Use the **connection pooling** string if available.

### Option C — Local PostgreSQL

Install from <https://www.postgresql.org/download/windows/>, then:

```
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/postgres
DATABASE_SSL=false
```

### Verify

```bash
npm run doctor
```

You want `✓ Database connection` and `✓ Schema  all 14 tables present`. The schema creates
itself on first connection — there is nothing to run by hand.

---

## Stage 2 — Discord bot (10 minutes)

1. <https://discord.com/developers/applications> → **New Application** → name it.
2. **Bot** tab:
   - **Reset Token** → copy it → `.env` as `DISCORD_TOKEN=`
   - Scroll to **Privileged Gateway Intents** → enable **SERVER MEMBERS INTENT** → Save
3. **General Information** → copy **Application ID** → `.env` as `DISCORD_CLIENT_ID=`
4. **OAuth2 → URL Generator**:
   - Scopes: `bot` **and** `applications.commands`
   - Bot permissions: `Manage Roles`, `Manage Channels`, `Send Messages`, `Embed Links`,
     `Attach Files`, `Read Message History`
   - Open the generated URL and invite the bot to a **test server**

> Use a throwaway server for this, not your real community. The wizard creates roles.

5. **Server Settings → Roles** → drag the bot's role **above** where the team roles will
   sit. Without this it cannot assign teams — this is the single most common failure.

### Verify

```bash
npm run doctor
```

You want `✓ Discord token` and `✓ Server membership`.

---

## Stage 3 — First run

```bash
npm start
```

Expected output:

```
HTTP server listening on port 3000; dashboard: /admin
Ready! Logged in as YourBot#1234
Deployed 1 command(s) to guild <id> (setup pending).
```

**That "1 command" line is the setup gate working.** In Discord, type `/` — you should see
only `/setup`. If you see more, the gate is broken.

---

## Stage 4 — The setup wizard

Run `/setup` in your test server.

| Step | What to do | What to check |
|---|---|---|
| 1 | Read the overview | Shows ⬜ for everything, lists what is still required |
| 2 | Menu → **Teams** → **Create teams for me** | Type 3 names, one per line |
| 3 | Check **Server Settings → Roles** | The 3 roles exist, coloured, above @everyone |
| 4 | `/setup` → **Channels** → set Submission, Leaderboard, Announcement, Team join | Each turns ✅ |
| 5 | **Fortnite feeds** → enable item shop → pick a channel | Turns ✅ |
| 6 | **Scoring** | Try `1` and `10`, then try letters — it should refuse letters |
| 7 | **Finish setup** | Green "Setup complete" panel |

Now check the terminal: `Deployed 8 command(s) to guild <id> (setup complete).`

In Discord, type `/` again — all 8 commands should now appear.

**Try the gate from the other side:** before finishing, press **Finish setup** with only
1 team. It must refuse and list what is missing.

---

## Stage 4b — Members must not see admin commands

Discord enforces permissions per command, so all admin actions live under `/manage`.

As an **administrator**, typing `/` shows all 8:

```
/tournament  /team  /leaderboard  /submit          ← everyone
/setup  /manage  /review  /admin-submit            ← admin only
```

Now test it as a **normal member**. Either use a second account, or temporarily remove
your own Administrator role. Type `/` — you must see **only** these four:

```
/tournament join | info | list
/team list | status
/leaderboard teams | players
/submit
```

If `/manage`, `/setup`, `/review` or `/admin-submit` is visible to a member, the gate is
broken. Check that the command has `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)`.

> Discord caches the command list per client. If a member still sees an old command, press
> Ctrl+R to reload, or wait a minute.

A member must also not reach an admin action by typing it manually — `/manage` is rejected
by Discord itself before the bot ever sees it.

---

## Stage 5 — Teams

1. `/manage team panel` → a panel with one button per team appears
2. Click a team button → you get the role, ephemeral confirmation
3. Click a **different** team button → refused, because switching is off by default
4. `/setup` → **Options** → enable **Team switching** → click another team → now it works
5. `/team status` → shows your team
6. `/manage team reset member:@you` → role removed, you can choose again
7. `/team list` → all teams with 0 points

**Race check:** click two team buttons as fast as you can. Only one may stick — the
database decides, not the code.

---

## Stage 6 — Tournament

```
/manage tournament create name:Test Cup regions:EU, NAE
```

A new tournament starts as a **draft**. Check that `/tournament info` refuses it for now
("not open yet") — a draft you are still preparing must stay invisible to members.

```
/manage tournament status status:Open
```

Check the announcement channel for the registration post.

```
/tournament join epic-name:YourEpicName region:EU
```

- Without a team first → it must refuse with "Join a team first"
- `/tournament info` → shows regions, 1 player, no code yet
- `/manage tournament players` → shows your registration with its Epic name

```
/manage tournament code region:EU code:1234-5678-9012
```

Check the announcement channel: the code is posted **and** you are pinged (because you
registered in EU). Someone registered in NAE must **not** be pinged.

---

## Stage 7 — Submissions and AI

### Without an AI key first

```
/submit kills:5 win:false
```

- Reply shows "AI verdict: no screenshot", status pending
- Check the submission channel for the staff notice
- `/review queue` → your submission appears

```
/submit kills:3 win:true
```

Must refuse: a win needs a screenshot.

### With an AI key

Get a free key from **one** of these:

- <https://openrouter.ai/keys> — free vision models, easiest
- <https://console.groq.com/keys> — fast, generous free tier
- <https://aistudio.google.com/apikey> — Gemini

Put it in `.env` (`OPENROUTER_API_KEY=` / `GROQ_API_KEY=` / `GEMINI_API_KEY=`), restart.

Now take a real Fortnite end-of-match screenshot (or grab one off Google Images) and:

```
/submit kills:7 win:true screenshot:<upload>
```

Check:
- The reply shows what the AI read: kills, confidence, and the Epic name
- If the name on the screenshot differs from your registered name, you get a warning
- Upload the **same image again** → must be refused as a duplicate

### Staff submitting for someone else

```
/admin-submit player:@someone kills:4 win:false
```

Must refuse if that player is not registered for the tournament.

---

## Stage 8 — Reviewing

### From Discord

```
/review queue                                    # list pending
/review show submission-id:1                     # see the screenshot
/review approve submission-id:1 win:false kills:5
/leaderboard teams                               # points appeared
/review remove submission-id:1 reason:testing
/leaderboard teams                               # points gone again
```

### From the web dashboard

1. Add to `.env`: `ADMIN_DASHBOARD_TOKEN=some-long-random-string`
2. Restart, open <http://localhost:3000/admin>
3. Sign in with that string

Check each tab:

| Tab | What should be there |
|---|---|
| **Pending** | Cards with the screenshot, AI verdict, pre-filled kills/win |
| **AI corrected** | Fills up once you approve something with values differing from the AI's |
| **Approved** / **Rejected** | Past decisions |

Then:
- Change the kills, approve → check `/leaderboard players` reflects it
- Approve one with values the AI disagrees with → it appears in **AI corrected**
- Type a wrong password 6 times → locked out for 15 minutes (this is the throttle working)

---

## Stage 9 — Live boards

```
/manage leaderboard post
```

Two messages appear. Now approve a submission and watch them update within a minute —
they also refresh immediately after every review.

Delete one board message, then run `/manage leaderboard post` again to re-create it.

---

## Stage 10 — Fortnite feeds

If you enabled the item shop in setup, a shop post appears within 15 minutes of startup
(or immediately on the first run). The news feed deliberately posts **nothing** on its
first run — it records the current backlog as "seen" so it does not dump 20 old posts into
your channel. New items appear from then on.

---

## Common problems

| Symptom | Cause |
|---|---|
| `I could not assign the role` | The bot's role is below the team roles. Drag it up. |
| Only `/setup` shows after finishing | Wait ~10s, or restart Discord (Ctrl+R) to refresh the command cache |
| `DATABASE_URL is not configured` | `.env` not loaded, or the variable is misspelled |
| Commands do not appear at all | `DISCORD_CLIENT_ID` missing or wrong |
| AI always says "verifier unavailable" | No provider key set, or the key is invalid |
| Dashboard redirects to login forever | `ADMIN_DASHBOARD_TOKEN` not set |
| Everything 500s | Run `npm run doctor` — usually the database |

Server-side errors are printed to the terminal running `npm start`. That is the first
place to look.
