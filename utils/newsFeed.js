const { EmbedBuilder } = require('discord.js');
const { query } = require('./db');
const { updateConfig } = require('./configStore');

const REQUEST_TIMEOUT_MS = 10000;
const MAX_SEEN_IDS = 100;

function extractTag(block, tag) {
    const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    if (!match) return null;
    return match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
}

function extractAtomLink(block) {
    const match = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    return match ? match[1] : null;
}

/** Handles plain RSS 2.0 <item> feeds and falls back to Atom <entry> feeds. */
function normalizeFeed(xml) {
    const items = [];

    for (const block of xml.match(/<item[\s\S]*?<\/item>/gi) || []) {
        const title = extractTag(block, 'title');
        const link = extractTag(block, 'link');
        const id = extractTag(block, 'guid') || link;
        if (!title || !id) continue;
        items.push({ id, title, link: link || id, pubDate: extractTag(block, 'pubDate') });
    }
    if (items.length) return items;

    for (const block of xml.match(/<entry[\s\S]*?<\/entry>/gi) || []) {
        const title = extractTag(block, 'title');
        const link = extractAtomLink(block);
        const id = extractTag(block, 'id') || link;
        if (!title || !id) continue;
        items.push({ id, title, link: link || id, pubDate: extractTag(block, 'updated') || extractTag(block, 'published') });
    }
    return items;
}

/** Only the first message in a batch carries a ping, so a busy feed does not spam @mentions. */
function mentionPayload(roleId, isFirst) {
    if (!roleId || !isFirst) return { allowedMentions: { parse: [] } };
    return { content: `<@&${roleId}>`, allowedMentions: { roles: [roleId] } };
}

async function fetchFeedItems(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ValorantCommunityBot/1.0)' },
    });
    if (!response.ok) throw new Error(`Feed responded with HTTP ${response.status}`);
    return normalizeFeed(await response.text());
}

async function getNewsGuildConfigs() {
    const result = await query(
        `SELECT guild_id, news_channel_id, news_feed_url, news_mention_role_id, news_seen_ids
         FROM guild_config
         WHERE news_enabled = TRUE AND news_channel_id IS NOT NULL AND news_feed_url IS NOT NULL`,
    );
    return result.rows;
}

async function refreshFeed(client, config) {
    const guild = client.guilds.cache.get(config.guild_id);
    if (!guild) return;

    const channel = await guild.channels.fetch(config.news_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    let items;
    try {
        items = await fetchFeedItems(config.news_feed_url);
    } catch (error) {
        console.error(`Could not fetch the news feed for guild ${config.guild_id}:`, error.message);
        return;
    }

    const seen = new Set(config.news_seen_ids || []);

    // A feed just connected has nothing to compare against — record the current backlog as
    // seen instead of dumping every existing article into the channel at once.
    if (seen.size === 0) {
        await updateConfig(config.guild_id, { news_seen_ids: items.map((item) => item.id).slice(0, MAX_SEEN_IDS) });
        return;
    }

    const freshItems = items.filter((item) => !seen.has(item.id));
    if (!freshItems.length) return;

    for (const [index, item] of freshItems.entries()) {
        const embed = new EmbedBuilder()
            .setColor(0xff4655)
            .setTitle(item.title.slice(0, 256))
            .setURL(/^https?:\/\//.test(item.link) ? item.link : null);
        if (item.pubDate && !Number.isNaN(Date.parse(item.pubDate))) embed.setTimestamp(new Date(item.pubDate));

        await channel.send({ embeds: [embed], ...mentionPayload(config.news_mention_role_id, index === 0) }).catch(() => {});
    }

    const updatedSeen = [...seen, ...freshItems.map((item) => item.id)].slice(-MAX_SEEN_IDS);
    await updateConfig(config.guild_id, { news_seen_ids: updatedSeen });
}

async function refreshAllNews(client) {
    for (const config of await getNewsGuildConfigs()) {
        await refreshFeed(client, config).catch((error) =>
            console.error(`News refresh failed for guild ${config.guild_id}:`, error.message),
        );
    }
}

module.exports = { fetchFeedItems, mentionPayload, normalizeFeed, refreshAllNews, refreshFeed };
