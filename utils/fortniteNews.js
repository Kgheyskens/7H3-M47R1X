const { EmbedBuilder } = require('discord.js');
const { query } = require('./db');
const { fetchAes, fetchNews } = require('./fortniteApi');

const SEEN_NEWS_CAP = 500;

function normalizeNews(payload) {
    const motds = payload?.data?.motds;
    if (!Array.isArray(motds)) return [];

    return motds
        .filter((motd) => motd?.id)
        .map((motd) => ({
            id: String(motd.id),
            title: motd.title || 'Fortnite news',
            body: motd.body || '',
            image: motd.image || motd.tileImage || null,
        }));
}

/** `++Fortnite+Release-29.40-CL-…` → `29.40`. */
function versionFromBuild(build) {
    const match = String(build || '').match(/Release-(\d+\.\d+)/);
    return match ? match[1] : null;
}

function newsEmbed(item) {
    const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle(item.title.slice(0, 256))
        .setFooter({ text: 'Fortnite news · fortnite-api.com' })
        .setTimestamp();

    if (item.body) embed.setDescription(item.body.slice(0, 4096));
    if (item.image) embed.setImage(item.image);
    return embed;
}

function updateEmbed(version) {
    return new EmbedBuilder()
        .setColor(0x22d3ee)
        .setTitle('🚀 Fortnite update detected')
        .setDescription(`The game has been updated to version **${version}**.`)
        .setTimestamp();
}

/** Only the first message in a channel carries a ping, so edits never re-ping. */
function mentionPayload(roleId, isFirstMessage) {
    if (!roleId || !isFirstMessage) return { allowedMentions: { parse: [] } };
    return { content: `<@&${roleId}>`, allowedMentions: { roles: [roleId] } };
}

async function getNewsFeed(guildId) {
    const result = await query('SELECT * FROM fortnite_news_feeds WHERE guild_id = $1', [guildId]);
    return result.rows[0] || null;
}

async function setNewsFeed(guildId, channelId, mentionRoleId = null) {
    await query(
        `INSERT INTO fortnite_news_feeds (guild_id, channel_id, mention_role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id) DO UPDATE
         SET channel_id = EXCLUDED.channel_id, mention_role_id = EXCLUDED.mention_role_id, updated_at = NOW()`,
        [guildId, channelId, mentionRoleId],
    );
}

async function clearNewsFeed(guildId) {
    await query('DELETE FROM fortnite_news_feeds WHERE guild_id = $1', [guildId]);
}

async function recordSeen(guildId, ids, lastBuild) {
    await query(
        `UPDATE fortnite_news_feeds
         SET seen_news_ids = (
                 SELECT ARRAY(
                     SELECT unnest FROM unnest(seen_news_ids || $2::TEXT[])
                     OFFSET GREATEST(0, cardinality(seen_news_ids || $2::TEXT[]) - $3)
                 )
             ),
             last_build = COALESCE($4, last_build),
             updated_at = NOW()
         WHERE guild_id = $1`,
        [guildId, ids, SEEN_NEWS_CAP, lastBuild],
    );
}

async function publish(guild, feed, items, version) {
    const channel = await guild.channels.fetch(feed.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const seen = new Set(feed.seen_news_ids || []);
    const fresh = items.filter((item) => !seen.has(item.id));

    // A brand new feed would otherwise dump the entire backlog into the channel.
    if (!seen.size) {
        await recordSeen(guild.id, items.map((item) => item.id), version);
        return;
    }

    let isFirstMessage = true;
    const posted = [];

    for (const item of fresh) {
        await channel.send({ embeds: [newsEmbed(item)], ...mentionPayload(feed.mention_role_id, isFirstMessage) });
        posted.push(item.id);
        isFirstMessage = false;
    }

    // A build change is only announced after two consecutive non-empty observations.
    if (version && feed.last_build && feed.last_build !== version) {
        await channel.send({ embeds: [updateEmbed(version)], ...mentionPayload(feed.mention_role_id, isFirstMessage) });
    }

    if (posted.length || version !== feed.last_build) {
        await recordSeen(guild.id, posted, version);
    }
}

let refreshPromise = null;

async function refreshAllNews(client) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        const feeds = await query('SELECT * FROM fortnite_news_feeds');
        if (!feeds.rows.length) return;

        const items = normalizeNews(await fetchNews());
        const version = await fetchAes()
            .then((payload) => versionFromBuild(payload?.data?.build))
            .catch(() => null);

        for (const feed of feeds.rows) {
            const guild = client.guilds.cache.get(feed.guild_id);
            if (!guild) continue;
            await publish(guild, feed, items, version).catch((error) =>
                console.error(`Could not update the news feed for guild ${feed.guild_id}:`, error.message),
            );
        }
    })().finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
}

module.exports = {
    SEEN_NEWS_CAP,
    clearNewsFeed,
    getNewsFeed,
    mentionPayload,
    newsEmbed,
    normalizeNews,
    refreshAllNews,
    setNewsFeed,
    versionFromBuild,
};
