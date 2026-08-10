const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const COMMANDS_DIRECTORY = path.join(__dirname, '..', 'commands');

function loadCommands() {
    const commands = [];
    for (const folder of fs.readdirSync(COMMANDS_DIRECTORY)) {
        for (const file of fs.readdirSync(path.join(COMMANDS_DIRECTORY, folder)).filter((f) => f.endsWith('.js'))) {
            commands.push(require(path.join(COMMANDS_DIRECTORY, folder, file)));
        }
    }
    return commands;
}

test('every command module exposes data and execute', () => {
    const commands = loadCommands();
    assert.ok(commands.length >= 7);
    for (const command of commands) {
        assert.ok(command.data, 'a command is missing its builder');
        assert.equal(typeof command.execute, 'function');
    }
});

test('admin commands are hidden from non-administrators', () => {
    const adminOnly = new Set(['setup', 'review', 'admin-submit']);
    for (const command of loadCommands()) {
        const json = command.data.toJSON();
        if (adminOnly.has(json.name)) {
            assert.equal(json.default_member_permissions, '8', `${json.name} must be hidden from non-administrators`);
        }
    }
});

test('setup is the only command a fresh guild receives', () => {
    const { loadCommandModules } = require('../deploy/deployCommands');
    const beforeSetup = loadCommandModules()
        .map((command) => command.data.name)
        .filter((name) => name === 'setup');

    assert.deepEqual(beforeSetup, ['setup']);
});

test('modules load without a database configured', () => {
    delete process.env.DATABASE_URL;
    const db = require('../utils/db');
    assert.equal(db.pool, null);
    assert.throws(() => db.requireDatabase(), /DATABASE_URL is not configured\./);
});
