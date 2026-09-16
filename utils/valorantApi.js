const { CLASS_ORDER, DEFAULT_AGENTS } = require('./valorantData');

const AGENTS_URL = 'https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US';
const REQUEST_TIMEOUT_MS = 10000;

function colorFromGradient(colors) {
    const first = colors?.[0];
    if (!first || first.length < 6) return null;
    return Number.parseInt(first.slice(0, 6), 16);
}

/**
 * The static roster in valorantData.js is a snapshot and goes stale whenever Riot ships a
 * new agent. This is the live source of truth; callers fall back to the snapshot only when
 * the API is unreachable.
 */
async function fetchLiveAgents() {
    const response = await fetch(AGENTS_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`valorant-api.com responded with HTTP ${response.status}`);

    const body = await response.json();
    const agents = body?.data;
    if (!Array.isArray(agents)) throw new Error('valorant-api.com returned an unexpected shape');

    return agents
        .map((agent) => ({
            label: agent.displayName,
            group: agent.role?.displayName?.toLowerCase(),
            color: colorFromGradient(agent.backgroundGradientColors),
        }))
        .filter((agent) => agent.label && CLASS_ORDER.includes(agent.group));
}

async function getAgentRoster() {
    try {
        const live = await fetchLiveAgents();
        if (live.length) return live;
    } catch (error) {
        console.error('Could not fetch the live agent roster, using the built-in snapshot instead:', error.message);
    }

    return DEFAULT_AGENTS;
}

module.exports = { fetchLiveAgents, getAgentRoster };
