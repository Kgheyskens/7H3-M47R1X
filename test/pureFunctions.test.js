const test = require('node:test');
const assert = require('node:assert/strict');

const { formatMessage } = require('../utils/welcomeGoodbye');
const { CLASS_ORDER, CLASSES, DEFAULT_AGENTS, DEFAULT_RANKS } = require('../utils/valorantData');
const { mentionPayload, normalizeFeed } = require('../utils/newsFeed');
const { boundedJoin, chunkText, truncate } = require('../utils/text');
const { acquireLock, releaseLock } = require('../utils/actionLock');
const { rulesPayload } = require('../utils/panelRender');

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

test('boundedJoin stays under the limit and lists everything when it fits', () => {
    assert.equal(boundedJoin(['A', 'B', 'C']), 'A, B, C');
    assert.equal(boundedJoin([]), '');
});

test('boundedJoin truncates and reports how many were left out, so a long list cannot overflow a Discord embed field', () => {
    const labels = Array.from({ length: 100 }, (_, i) => `Agent${i}`);
    const result = boundedJoin(labels, 50);
    assert.ok(result.length <= 50 + 20, 'the result must stay close to the requested limit');
    assert.match(result, /…and \d+ more$/);
});

test('a lock can only be held by one caller at a time', () => {
    assert.equal(acquireLock('roles:g1'), true);
    assert.equal(acquireLock('roles:g1'), false, 'a second acquire while held must fail');
    releaseLock('roles:g1');
    assert.equal(acquireLock('roles:g1'), true, 'releasing must free it up again');
    releaseLock('roles:g1');
});

test('truncate leaves short text alone and adds an ellipsis to long text', () => {
    assert.equal(truncate('short', 100), 'short');
    assert.equal(truncate('a'.repeat(20), 10), `${'a'.repeat(9)}…`);
});

test('chunkText returns a single chunk when the text already fits', () => {
    assert.deepEqual(chunkText('short rules', 4000), ['short rules']);
});

test('chunkText splits long text on a line boundary near the limit, not mid-word', () => {
    const text = `${'a'.repeat(9990)}\n${'b'.repeat(20)}`;
    const chunks = chunkText(text, 10000);

    assert.equal(chunks.length, 2);
    assert.ok(chunks.every((chunk) => chunk.length <= 10000));
    assert.equal(chunks.join('\n'), text);
});

test('chunkText hard-splits a chunk with no line breaks at all', () => {
    const text = 'x'.repeat(9000);
    const chunks = chunkText(text, 4000);

    assert.equal(chunks.length, 3);
    assert.equal(chunks.join(''), text);
});

test('a short rules message is a single embed with no button when accepting is off', () => {
    const payload = rulesPayload({ rules_message: 'Be nice.', rules_accept_enabled: false });
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.embeds[0].toJSON().description, 'Be nice.');
    assert.equal(payload.components.length, 0);
});

test('a rules message longer than one embed can hold is split across several embeds, and stays valid', () => {
    const payload = rulesPayload({ rules_message: 'x'.repeat(9000), rules_accept_enabled: true });
    assert.ok(payload.embeds.length > 1, 'must split into more than one embed');
    for (const embed of payload.embeds) {
        const json = embed.toJSON();
        assert.ok(json.description.length <= 4096, 'no single embed description may exceed the Discord limit');
    }
    assert.equal(payload.embeds[0].toJSON().title, '📜 Server rules');
    assert.equal(payload.components.length, 1, 'the accept button is still attached once, not per embed');
});
