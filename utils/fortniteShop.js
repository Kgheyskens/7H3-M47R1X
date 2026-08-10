const crypto = require('node:crypto');
const { EmbedBuilder } = require('discord.js');
const { query } = require('./db');
const { fetchShop } = require('./fortniteApi');

/** Bump this to force every guild's shop message to re-render on the next tick. */
const FORMAT_VERSION = 'shop-v1-en';

const CATEGORY_ORDER = ['Bundles', 'Outfits', 'Back Blings', 'Pickaxes', 'Gliders', 'Emotes', 'Wraps', 'Other'];

const TYPE_TO_CATEGORY = {
    outfit: 'Outfits',
    backpack: 'Back Blings',
    pickaxe: 'Pickaxes',
    glider: 'Gliders',
    emote: 'Emotes',
    wrap: 'Wraps',
};

/** The upstream payload has changed shape over time, so three layouts are tried in order. */
function newestEntries(shop) {
    const data = shop?.data || shop || {};

    if (Array.isArray(data.featured?.entries) && data.featured.entries.length) {
        return data.featured.entries;
    }

    if (Array.isArray(data.entries)) {
        const fresh = data.entries.filter((entry) => entry?.newDisplayAsset || entry?.layout?.name);
        return fresh.length ? fresh : data.entries;
    }

    return [];
}

function displayName(entry) {
    return (
        entry?.bundle?.name ||
        entry?.items?.[0]?.name ||
        entry?.newDisplayAsset?.materialInstances?.[0]?.id ||
        'Unknown item'
    );
}

function firstImage(entry) {
    return (
        entry?.bundle?.image ||
        entry?.newDisplayAsset?.renderImages?.[0]?.image ||
        entry?.items?.[0]?.images?.featured ||
        entry?.items?.[0]?.images?.icon ||
        entry?.items?.[0]?.images?.smallIcon ||
        null
    );
}

function categoryFor(entry) {
    if (entry?.bundle) return 'Bundles';
    const type = entry?.items?.[0]?.type?.value;
    return TYPE_TO_CATEGORY[type] || 'Other';
}

function sortEntries(entries) {
    return [...entries].sort((a, b) => {
        const categoryDelta = CATEGORY_ORDER.indexOf(categoryFor(a)) - CATEGORY_ORDER.indexOf(categoryFor(b));
        if (categoryDelta !== 0) return categoryDelta;
        return displayName(a).localeCompare(displayName(b));
    });
}

function priceOf(entry) {
    const price = entry?.finalPrice ?? entry?.regularPrice;
    return Number.isFinite(price) ? price : null;
}

function normalizeShop(shop) {
    const entries = sortEntries(newestEntries(shop));
    const grouped = new Map();

    for (const entry of entries) {
        const category = categoryFor(entry);
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push({ name: displayName(entry), price: priceOf(entry), image: firstImage(entry) });
    }

    return {
        categories: CATEGORY_ORDER.filter((category) => grouped.has(category)).map((category) => ({
            name: category,
            items: grouped.get(category),
        })),
        image: entries.map(firstImage).find(Boolean) || null,
        total: entries.length,
    };
}

const FIELD_LIMIT = 1024;

function buildShopEmbeds(normalized) {
    const embed = new EmbedBuilder()
        .setColor(0x55d6ff)
        .setTitle('🛒 Fortnite Item Shop')
        .setDescription(`${normalized.total} item${normalized.total === 1 ? '' : 's'} in today's shop.`)
        .setFooter({ text: 'Updates automatically · fortnite-api.com' })
        .setTimestamp();

    if (normalized.image) embed.setImage(normalized.image);

    for (const category of normalized.categories.slice(0, 25)) {
        const lines = [];
        let length = 0;

        for (const item of category.items) {
            const line = item.price ? `• ${item.name} — ${item.price} V-Bucks` : `• ${item.name}`;
            if (length + line.length + 1 > FIELD_LIMIT - 20) {
                lines.push(`• …and ${category.items.length - lines.length} more`);
                break;
            }
            lines.push(line);
            length += line.length + 1;
        }

        embed.addFields({ name: `${category.name} (${category.items.length})`, value: lines.join('\n') });
    }

    return [embed];
}

function hashPayload(normalized) {
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

async function getShopPanel(guildId) {
    const result = await query('SELECT * FROM fortnite_shop_panels WHERE guild_id = $1', [guildId]);
    return result.rows[0] || null;
}

async function setShopPanel(guildId, channelId, messageIds, shopHash) {
    await query(
        `INSERT INTO fortnite_shop_panels (guild_id, channel_id, message_ids, shop_hash, format_version)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id) DO UPDATE
         SET channel_id = EXCLUDED.channel_id, message_ids = EXCLUDED.message_ids,
             shop_hash = EXCLUDED.shop_hash, format_version = EXCLUDED.format_version, updated_at = NOW()`,
        [guildId, channelId, messageIds, shopHash, FORMAT_VERSION],
    );
}

async function clearShopPanel(guildId) {
    await query('DELETE FROM fortnite_shop_panels WHERE guild_id = $1', [guildId]);
}

/** Edits the tracked message in place; only reposts when it is gone or not ours. */
async function reconcile(guild, panel, embeds, hash) {
    const channel = await guild.channels.fetch(panel.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const unchanged = panel.shop_hash === hash && panel.format_version === FORMAT_VERSION;
    const [messageId] = panel.message_ids || [];

    if (messageId) {
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (message && message.author.id === guild.client.user.id) {
            if (unchanged) return;
            await message.edit({ embeds });
            await setShopPanel(guild.id, channel.id, [message.id], hash);
            return;
        }
        // Never delete a message the bot does not own.
        if (message) await message.delete().catch(() => {});
    }

    const posted = await channel.send({ embeds });
    await setShopPanel(guild.id, channel.id, [posted.id], hash);
}

let refreshPromise = null;

/** One upstream fetch serves every guild, so guild count does not multiply API usage. */
async function refreshAllShops(client) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        const panels = await query('SELECT * FROM fortnite_shop_panels');
        if (!panels.rows.length) return;

        const normalized = normalizeShop(await fetchShop());
        const embeds = buildShopEmbeds(normalized);
        const hash = hashPayload(normalized);

        for (const panel of panels.rows) {
            const guild = client.guilds.cache.get(panel.guild_id);
            if (!guild) continue;
            await reconcile(guild, panel, embeds, hash).catch((error) =>
                console.error(`Could not update the shop for guild ${panel.guild_id}:`, error.message),
            );
        }
    })().finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
}

module.exports = {
    CATEGORY_ORDER,
    FORMAT_VERSION,
    buildShopEmbeds,
    categoryFor,
    clearShopPanel,
    displayName,
    firstImage,
    getShopPanel,
    newestEntries,
    normalizeShop,
    refreshAllShops,
    setShopPanel,
    sortEntries,
};
