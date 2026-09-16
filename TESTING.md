# Testing guide

Work through this top to bottom. Run `npm run doctor` after every configuration change —
it tells you what is still missing.

---

## Stage 0 — What runs without any setup

These need nothing but `npm install`:

```bash
npm test              # unit tests: message placeholders, roster data, command shapes
npm run validate-sql  # parses every SQL statement with the real Postgres grammar
npm run smoke         # setup/config/self-role flow against an in-memory Postgres
npm run doctor        # tells you what is still missing
```

If these pass, the logic is sound. Everything below tests the integration.

---

## Stage 1 — Database (15 minutes, free)

Pick **one**:

### Option A — Neon (recommended, no install)

1. <https://neon.tech> → sign up → **Create project**.
2. Copy the connection string and put it in `.env` as `DATABASE_URL=`.

### Option B — Local PostgreSQL

```
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/postgres
DATABASE_SSL=false
```

### Verify

```bash
npm run doctor
```

You want `✓ Database connection` and `✓ Schema  all 2 tables present`. The schema creates
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
   - Bot permissions: `Manage Roles`, `Send Messages`, `Embed Links`
   - Open the generated URL and invite the bot to your server
5. **Server Settings → Roles** → drag the bot's role **above** where the rank/agent roles
   will sit. Without this it cannot assign them — this is the single most common failure.

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
HTTP server listening on port 3000 for uptime pings.
Ready! Logged in as YourBot#1234
Deployed 1 command(s) to guild <id> (setup pending).
```

**That "1 command" line is the setup gate working.** In Discord, type `/` — you should see
only `/setup`.

---

## Stage 4 — The setup wizard

Run `/setup` in your server.

| Step | What to do | What to check |
|---|---|---|
| 1 | Menu → **Welcome message** → enable, pick a channel, edit the message | Overview shows ✅ |
| 2 | Menu → **Goodbye message** → same | Overview shows ✅ |
| 3 | Menu → **Rules** → set a channel, write the text, enable the accept button, pick the role it grants, **Post rules message** | The message appears in the channel with an **I agree** button |
| 4 | Menu → **Ranks & agents** → **Create default ranks**, then **Create default agents** | Check **Server Settings → Roles** — 9 rank roles and the full agent roster now exist |
| 5 | Pick a roles panel channel → **Post role panel** | A message with a rank select menu and one select menu per agent class appears |
| 6 | **Finish setup** | Green "Setup complete" panel |

Now check the terminal: `Deployed 3 command(s) to guild <id> (setup complete).`

In Discord, type `/` again — `/roles` and `/agent` should now appear alongside `/setup`.

---

## Stage 5 — Member-facing behaviour

1. As a normal member, click **I agree** on the rules message → you get the configured role
   and an ephemeral confirmation. Click it again → told you already accepted.
2. Pick a rank from the panel's rank select → you get that role, any previous rank role is
   removed. Re-open the menu and pick a different one → the old one is swapped out.
3. Pick two or three agents from one class's select menu → you get exactly those roles.
   Deselect one → it's removed, the others stay.
4. `/roles` → shows your current rank and agent pool.
5. `/agent` and `/agent class:Sentinel` → a random suggestion, restricted to the class when
   given.

---

## Stage 6 — Welcome and goodbye

1. Have a second account join the server → the welcome message appears in the configured
   channel with placeholders filled in.
2. Have that account leave → the goodbye message appears.
3. Disable welcome in `/setup` → re-join → nothing is posted.

---

## Stage 7 — Adding a rank or agent later

Ranks and agents don't have to be the defaults forever:

1. `/setup` → **Ranks & agents** → **Add rank** → type a name → a new role is created and
   added to the panel.
2. **Remove rank** → pick one from the list → its role is deleted from Discord too.
3. Same for **Add agent** / **Remove agent**, with a class picker in between since a
   `/setup` server can have more agents than fit in one dropdown.
4. Re-post the role panel to pick up the change — editing in place reuses the same message,
   so it won't spam a new one into the channel each time.

---

## Common problems

| Symptom | Cause |
|---|---|
| `I could not assign the role` | The bot's role is below the rank/agent roles. Drag it up. |
| Only `/setup` shows after finishing | Wait ~10s, or restart Discord (Ctrl+R) to refresh the command cache |
| `DATABASE_URL is not configured` | `.env` not loaded, or the variable is misspelled |
| Commands do not appear at all | `DISCORD_CLIENT_ID` missing or wrong |
| No welcome/goodbye message | The feature is disabled, or no channel is set, in `/setup` |
| Everything 500s | Run `npm run doctor` — usually the database |
| Bot goes offline after inactivity on Render | Point an UptimeRobot monitor at the service's public URL |

Server-side errors are printed to the terminal running `npm start`. That is the first
place to look.
