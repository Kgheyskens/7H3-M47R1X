const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const COMMANDS_DIRECTORY = path.join(__dirname, '..', 'commands');

/** Commands available before /setup has been completed. */
const SETUP_ONLY = new Set(['setup']);

function loadCommandModules() {
    const modules = [];
    if (!fs.existsSync(COMMANDS_DIRECTORY)) return modules;

    for (const folder of fs.readdirSync(COMMANDS_DIRECTORY)) {
        const folderPath = path.join(COMMANDS_DIRECTORY, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;

        for (const file of fs.readdirSync(folderPath).filter((name) => name.endsWith('.js'))) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);
            if (command?.data && command?.execute) {
                modules.push(command);
            } else {
                console.warn(`[WARNING] The command at ${filePath} is missing a "data" or "execute" property.`);
            }
        }
    }

    return modules;
}

function restClient() {
    const token = process.env.DISCORD_TOKEN || process.env.CLIENT_TOKEN;
    return token ? new REST().setToken(token) : null;
}

/**
 * A guild only sees the full command set once setup is complete. Before that
 * /setup is the single entry point, so nothing can be misconfigured by accident.
 */
async function deployGuildCommands(guildId, setupCompleted) {
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
    const rest = restClient();

    if (!rest || !clientId) {
        console.warn('Skipping command deploy because the bot token or client id is missing.');
        return;
    }

    const commands = loadCommandModules()
        .filter((command) => setupCompleted || SETUP_ONLY.has(command.data.name))
        .map((command) => command.data.toJSON());

    try {
        const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`Deployed ${data.length} command(s) to guild ${guildId} (setup ${setupCompleted ? 'complete' : 'pending'}).`);
    } catch (error) {
        console.error(`Could not deploy commands to guild ${guildId}:`, error.message);
    }
}

/**
 * Global commands are cleared so a guild can never see a stale full command list
 * from an earlier deploy while its setup is still pending.
 */
async function clearGlobalCommands() {
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
    const rest = restClient();
    if (!rest || !clientId) return;

    try {
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
    } catch (error) {
        console.error('Could not clear global commands:', error.message);
    }
}

module.exports = { clearGlobalCommands, deployGuildCommands, loadCommandModules };
