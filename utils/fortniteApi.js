const BASE_URL = 'https://fortnite-api.com';
const TIMEOUT_MS = 15000;

/** The key is optional; the public API serves these endpoints unauthenticated. */
function headers() {
    const result = { 'Content-Type': 'application/json' };
    const apiKey = process.env.FORTNITE_API_KEY;
    // fortnite-api.com expects a bare key, not a Bearer token.
    if (apiKey) result.Authorization = apiKey;
    return result;
}

async function fetchJson(path) {
    const response = await fetch(`${BASE_URL}${path}`, {
        headers: headers(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`Fortnite API responded with ${response.status} for ${path}`);
    }

    return response.json();
}

const fetchShop = () => fetchJson('/v2/shop?lang=en');
const fetchNews = () => fetchJson('/v2/news/br?lang=en');
const fetchAes = () => fetchJson('/v2/aes');

module.exports = { fetchAes, fetchNews, fetchShop };
