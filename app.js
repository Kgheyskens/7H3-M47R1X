require('dotenv').config();

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');

const { clearGlobalCommands, deployGuildCommands } = require('./deploy/deployCommands');
const { syncAllGuilds } = require('./utils/agentSync');
const { ensureConfig, isSetupCompleted } = require('./utils/configStore');
const { refreshAllNews } = require('./utils/newsFeed');
const { sendGoodbye, sendWelcome } = require('./utils/welcomeGoodbye');

const BOT_TOKEN = process.env.DISCORD_TOKEN || process.env.CLIENT_TOKEN;

if (!BOT_TOKEN) {
    throw new Error('DISCORD_TOKEN is missing. Add it to your hosting environment variables or a local .env file.');
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection();

const COMMANDS_DIRECTORY = path.join(__dirname, 'commands');

for (const folder of fs.readdirSync(COMMANDS_DIRECTORY)) {
    const folderPath = path.join(COMMANDS_DIRECTORY, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    for (const file of fs.readdirSync(folderPath).filter((name) => name.endsWith('.js'))) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        if (command?.data && command?.execute) {
            client.commands.set(command.data.name, command);
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a "data" or "execute" property.`);
        }
    }
}

// Render's free/hobby tiers spin the service down after idle, and UptimeRobot needs
// something to ping to keep it awake — this is that endpoint.
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}).listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT} for uptime pings.`);
});

const REFRESH_NEWS_MS = 15 * 60 * 1000;
const SYNC_AGENTS_MS = 12 * 60 * 60 * 1000;

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    await clearGlobalCommands();

    for (const guild of readyClient.guilds.cache.values()) {
        try {
            await ensureConfig(guild.id);
            await deployGuildCommands(guild.id, await isSetupCompleted(guild.id));
        } catch (error) {
            console.error(`Could not initialise guild ${guild.id}:`, error.message);
        }
    }

    refreshAllNews(readyClient).catch((error) => console.error('Initial news refresh failed:', error.message));
    syncAllGuilds(readyClient).catch((error) => console.error('Initial agent sync failed:', error.message));

    setInterval(() => {
        refreshAllNews(readyClient).catch((error) => console.error('Scheduled news refresh failed:', error.message));
    }, REFRESH_NEWS_MS);

    setInterval(() => {
        syncAllGuilds(readyClient).catch((error) => console.error('Scheduled agent sync failed:', error.message));
    }, SYNC_AGENTS_MS);
});

client.on(Events.GuildCreate, async (guild) => {
    try {
        await ensureConfig(guild.id);
        await deployGuildCommands(guild.id, false);
        console.log(`Joined guild ${guild.id}; only /setup is available until setup completes.`);
    } catch (error) {
        console.error(`Could not prepare guild ${guild.id}:`, error.message);
    }
});

client.on(Events.GuildMemberAdd, (member) => {
    sendWelcome(member).catch((error) => console.error('Welcome message failed:', error.message));
});

client.on(Events.GuildMemberRemove, (member) => {
    sendGoodbye(member.guild, member.user).catch((error) => console.error('Goodbye message failed:', error.message));
});

/**
 * Components route on the first ':'-delimited segment of their customId, which
 * must equal a registered command name.
 */
function resolveComponentHandler(interaction) {
    const [handlerName] = interaction.customId.split(':');
    return interaction.client.commands.get(handlerName);
}

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            // /setup is the only command reachable before setup completes.
            if (interaction.commandName !== 'setup' && interaction.guildId) {
                if (!(await isSetupCompleted(interaction.guildId))) {
                    await interaction.reply({
                        content: 'This server has not been set up yet. An administrator must run `/setup` first.',
                        ephemeral: true,
                    });
                    return;
                }
            }

            await command.execute(interaction);
            return;
        }

        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (command?.autocomplete) await command.autocomplete(interaction);
            return;
        }

        if (interaction.isAnySelectMenu()) {
            const handler = resolveComponentHandler(interaction);
            if (handler?.handleSelectMenu) await handler.handleSelectMenu(interaction);
            return;
        }

        if (interaction.isButton()) {
            const handler = resolveComponentHandler(interaction);
            if (handler?.handleButton) await handler.handleButton(interaction);
            return;
        }

        if (interaction.isModalSubmit()) {
            const handler = resolveComponentHandler(interaction);
            if (handler?.handleModalSubmit) await handler.handleModalSubmit(interaction);
        }
    } catch (error) {
        console.error(error);
        const response = { content: 'Something went wrong while performing this action.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(response).catch(() => {});
        } else {
            await interaction.reply(response).catch(() => {});
        }
    }
});

client.login(BOT_TOKEN);

module.exports = { client };
