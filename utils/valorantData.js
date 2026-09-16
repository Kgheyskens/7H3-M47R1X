const CLASSES = {
    duelist: { label: 'Duelist', emoji: '⚔️' },
    controller: { label: 'Controller', emoji: '🌀' },
    initiator: { label: 'Initiator', emoji: '🧭' },
    sentinel: { label: 'Sentinel', emoji: '🛡️' },
};

const CLASS_ORDER = ['duelist', 'controller', 'initiator', 'sentinel'];

// Every tier except Radiant is split into 3 divisions, matching Valorant's actual rank
// ladder (e.g. "Gold 2") — 8 tiers × 3 divisions + Radiant = 25, which is not a coincidence:
// it is exactly Discord's 25-option limit for a single select menu, so the whole ladder
// fits in one rank dropdown on the panel.
const RANK_TIERS = [
    { label: 'Iron', color: 0x4f4f4f, emoji: '🔘', divisions: 3 },
    { label: 'Bronze', color: 0xa97142, emoji: '🟤', divisions: 3 },
    { label: 'Silver', color: 0xbfc1c2, emoji: '⚪', divisions: 3 },
    { label: 'Gold', color: 0xe8b923, emoji: '🟡', divisions: 3 },
    { label: 'Platinum', color: 0x17a2a2, emoji: '🟢', divisions: 3 },
    { label: 'Diamond', color: 0xb983ff, emoji: '🔷', divisions: 3 },
    { label: 'Ascendant', color: 0x10dc7c, emoji: '💚', divisions: 3 },
    { label: 'Immortal', color: 0xa52834, emoji: '🔴', divisions: 3 },
    { label: 'Radiant', color: 0xf4f1a0, emoji: '✨', divisions: 0 },
];

const DEFAULT_RANKS = RANK_TIERS.flatMap((tier) =>
    tier.divisions
        ? Array.from({ length: tier.divisions }, (_, index) => ({
              label: `${tier.label} ${index + 1}`,
              color: tier.color,
              emoji: tier.emoji,
          }))
        : [{ label: tier.label, color: tier.color, emoji: tier.emoji }],
);

const DEFAULT_AGENTS = [
    { label: 'Jett', group: 'duelist', color: 0x7ec8e3 },
    { label: 'Phoenix', group: 'duelist', color: 0xff6b35 },
    { label: 'Raze', group: 'duelist', color: 0xff8c00 },
    { label: 'Reyna', group: 'duelist', color: 0x8e44ad },
    { label: 'Yoru', group: 'duelist', color: 0x2e4372 },
    { label: 'Neon', group: 'duelist', color: 0x00d4ff },
    { label: 'Iso', group: 'duelist', color: 0x8a2be2 },
    { label: 'Waylay', group: 'duelist', color: 0x00ced1 },

    { label: 'Brimstone', group: 'controller', color: 0xc0392b },
    { label: 'Viper', group: 'controller', color: 0x39ff14 },
    { label: 'Omen', group: 'controller', color: 0x4b0082 },
    { label: 'Astra', group: 'controller', color: 0x7b2ff7 },
    { label: 'Harbor', group: 'controller', color: 0x1b998b },
    { label: 'Clove', group: 'controller', color: 0xff69b4 },
    { label: 'Miks', group: 'controller', color: 0x8a8a8a },

    { label: 'Sova', group: 'initiator', color: 0x4a6572 },
    { label: 'Breach', group: 'initiator', color: 0xd35400 },
    { label: 'Skye', group: 'initiator', color: 0x6aa84f },
    { label: 'KAY/O', group: 'initiator', color: 0x95a5a6 },
    { label: 'Fade', group: 'initiator', color: 0x5b2c6f },
    { label: 'Gekko', group: 'initiator', color: 0x7cfc00 },
    { label: 'Tejo', group: 'initiator', color: 0xf39c12 },

    { label: 'Killjoy', group: 'sentinel', color: 0xf1c40f },
    { label: 'Cypher', group: 'sentinel', color: 0x2c3e50 },
    { label: 'Sage', group: 'sentinel', color: 0x7fdbff },
    { label: 'Chamber', group: 'sentinel', color: 0xd4af37 },
    { label: 'Deadlock', group: 'sentinel', color: 0x00ced1 },
    { label: 'Vyse', group: 'sentinel', color: 0x9b59b6 },
    { label: 'Veto', group: 'sentinel', color: 0x8a8a8a },
];

// This list is a fallback snapshot for when the live valorant-api.com roster (see
// utils/valorantApi.js) can't be reached — it will drift out of date as Riot ships new
// agents, which is expected; the live fetch is the source of truth in normal operation.

module.exports = { CLASSES, CLASS_ORDER, DEFAULT_RANKS, DEFAULT_AGENTS };
