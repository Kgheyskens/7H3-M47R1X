const test = require('node:test');
const assert = require('node:assert/strict');

const { formatMessage } = require('../utils/welcomeGoodbye');
const { CLASS_ORDER, CLASSES, DEFAULT_AGENTS, DEFAULT_RANKS } = require('../utils/valorantData');
const { mentionPayload, normalizeFeed } = require('../utils/newsFeed');

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

test('RSS items are parsed with CDATA titles unwrapped', () => {
    const xml = `<rss><channel>
        <item>
            <title><![CDATA[Patch notes 10.0]]></title>
            <link>https://example.com/patch-10</link>
            <guid>https://example.com/patch-10</guid>
            <pubDate>Mon, 14 Sep 2026 13:23:54 GMT</pubDate>
        </item>
    </channel></rss>`;

    const items = normalizeFeed(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Patch notes 10.0');
    assert.equal(items[0].id, 'https://example.com/patch-10');
    assert.equal(items[0].pubDate, 'Mon, 14 Sep 2026 13:23:54 GMT');
});

test('an Atom feed is parsed when there are no RSS items', () => {
    const xml = `<feed>
        <entry>
            <title>New agent revealed</title>
            <id>tag:example.com,2026:1</id>
            <link href="https://example.com/new-agent" />
            <updated>2026-09-14T00:00:00Z</updated>
        </entry>
    </feed>`;

    const items = normalizeFeed(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'New agent revealed');
    assert.equal(items[0].link, 'https://example.com/new-agent');
});

test('a feed with no items or entries yields an empty list', () => {
    assert.deepEqual(normalizeFeed('<rss><channel></channel></rss>'), []);
});

test('only the first message in a batch carries a ping', () => {
    assert.deepEqual(mentionPayload('123', true), { content: '<@&123>', allowedMentions: { roles: ['123'] } });
    assert.deepEqual(mentionPayload('123', false), { allowedMentions: { parse: [] } });
    assert.deepEqual(mentionPayload(null, true), { allowedMentions: { parse: [] } });
});
