const test = require('node:test');
const assert = require('node:assert/strict');

const { formatMessage } = require('../utils/welcomeGoodbye');
const { CLASS_ORDER, CLASSES, DEFAULT_AGENTS, DEFAULT_RANKS } = require('../utils/valorantData');

test('welcome/goodbye placeholders are all substituted', () => {
    const text = formatMessage('{user} joined {server}, now {membercount} members ({username}).', {
        username: 'kayn',
        mention: '<@123>',
        guildName: 'The Range',
        memberCount: 42,
    });

    assert.equal(text, '<@123> joined The Range, now 42 members (kayn).');
});

test('a template with no placeholders is returned unchanged', () => {
    const text = formatMessage('Welcome!', { username: 'x', mention: 'x', guildName: 'x', memberCount: 1 });
    assert.equal(text, 'Welcome!');
});

test('every default agent belongs to a real class', () => {
    for (const agent of DEFAULT_AGENTS) {
        assert.ok(CLASS_ORDER.includes(agent.group), `${agent.label} has an unknown class "${agent.group}"`);
    }
});

test('every class in CLASS_ORDER has display metadata', () => {
    for (const key of CLASS_ORDER) {
        assert.ok(CLASSES[key]?.label, `${key} is missing a label`);
        assert.ok(CLASSES[key]?.emoji, `${key} is missing an emoji`);
    }
});

test('default ranks are unique and non-empty', () => {
    const labels = DEFAULT_RANKS.map((rank) => rank.label);
    assert.equal(new Set(labels).size, labels.length, 'rank labels must be unique');
    assert.ok(labels.length > 0);
});
