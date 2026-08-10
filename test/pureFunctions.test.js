const test = require('node:test');
const assert = require('node:assert/strict');

const { calculatePoints } = require('../utils/scoreStore');
const ai = require('../utils/aiVerifier');
const shop = require('../utils/fortniteShop');
const news = require('../utils/fortniteNews');

test('points combine kills and the win bonus', () => {
    assert.equal(calculatePoints(7, false), 7);
    assert.equal(calculatePoints(7, true), 17);
    assert.equal(calculatePoints(0, false), 0);
    assert.equal(calculatePoints(5, true, 2, 20), 30);
    assert.throws(() => calculatePoints(-1), TypeError);
    assert.throws(() => calculatePoints(1.5), TypeError);
});

test('AI output is clamped into a usable range', () => {
    const high = ai.normalize({ isVictory: true, kills: 250, confidence: 1.7, epicName: '  Ninja  ', reason: 'x' });
    assert.equal(high.kills, 100);
    assert.equal(high.confidence, 1);
    assert.equal(high.epicName, 'Ninja');

    const low = ai.normalize({ isVictory: false, kills: -3, confidence: null });
    assert.equal(low.kills, 0);
    assert.equal(low.confidence, null);
    assert.equal(low.epicName, null);
});

test('only a confident verdict decides; anything else goes to review', () => {
    assert.equal(ai.toDetection({ isVictory: true, kills: 4, confidence: 0.995 }).status, 'verified');
    assert.equal(ai.toDetection({ isVictory: false, kills: 2, confidence: 0.995 }).status, 'rejected');
    assert.equal(ai.toDetection({ isVictory: true, kills: 4, confidence: 0.6 }).status, 'manual_review');
    assert.equal(ai.toDetection({ isVictory: false, kills: 0, confidence: null }).status, 'unavailable');
});

test('shop entries fall back across upstream layouts', () => {
    assert.deepEqual(shop.newestEntries({ data: { featured: { entries: [{ a: 1 }] } } }), [{ a: 1 }]);
    assert.deepEqual(shop.newestEntries({ data: { entries: [{ b: 2 }] } }), [{ b: 2 }]);
    assert.deepEqual(shop.newestEntries({}), []);
});

test('shop items are named, imaged and bucketed', () => {
    assert.equal(shop.displayName({ bundle: { name: 'Pack' }, items: [{ name: 'Skin' }] }), 'Pack');
    assert.equal(shop.displayName({}), 'Unknown item');
    assert.equal(shop.firstImage({ items: [{ images: { icon: 'i.png' } }] }), 'i.png');
    assert.equal(shop.firstImage({}), null);
    assert.equal(shop.categoryFor({ bundle: {} }), 'Bundles');
    assert.equal(shop.categoryFor({ items: [{ type: { value: 'pickaxe' } }] }), 'Pickaxes');
    assert.equal(shop.categoryFor({ items: [{ type: { value: 'nonsense' } }] }), 'Other');
});

test('shop sorts by category order then alphabetically', () => {
    const sorted = shop
        .sortEntries([
            { items: [{ name: 'Zeta', type: { value: 'emote' } }] },
            { bundle: { name: 'Bundle' } },
            { items: [{ name: 'Alpha', type: { value: 'emote' } }] },
        ])
        .map(shop.displayName);

    assert.deepEqual(sorted, ['Bundle', 'Alpha', 'Zeta']);
});

test('a build string yields its version, or null', () => {
    assert.equal(news.versionFromBuild('++Fortnite+Release-29.40-CL-12345'), '29.40');
    assert.equal(news.versionFromBuild('garbage'), null);
    assert.equal(news.versionFromBuild(null), null);
});

test('only the first message in a channel carries a ping', () => {
    assert.deepEqual(news.mentionPayload('123', true), { content: '<@&123>', allowedMentions: { roles: ['123'] } });
    assert.deepEqual(news.mentionPayload('123', false), { allowedMentions: { parse: [] } });
    assert.deepEqual(news.mentionPayload(null, true), { allowedMentions: { parse: [] } });
});

test('news entries without an id are dropped', () => {
    const items = news.normalizeNews({ data: { motds: [{ id: 'a', title: 'T', body: 'B' }, { title: 'no id' }] } });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'a');
});
