const axios = require('axios');

const PROMPT = [
    'You are verifying a Fortnite end-of-match screenshot for a Discord tournament.',
    'Look at the image and answer strictly about what is visible.',
    'Return a JSON object with exactly these fields:',
    '- isVictory: true only if the "#1 Victory Royale" banner (a win) is clearly shown.',
    '- kills: the number of eliminations shown for this player (0 if not visible).',
    '- epicName: the in-game display name of the player this result belongs to, or null if unreadable.',
    '- confidence: your certainty from 0 to 1 that the above values are correct.',
    '- reason: one short sentence describing what you saw.',
    'Be conservative: if the image is unclear, edited, cropped, or not a Fortnite result screen, lower the confidence.',
].join('\n');

const OPENROUTER_FALLBACK_MODELS = [
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.2-11b-vision-instruct:free',
    'qwen/qwen2.5-vl-72b-instruct:free',
];

const REQUEST_TIMEOUT_MS = 20000;

function unavailable(reason) {
    return { isVictory: false, kills: 0, epicName: null, confidence: null, reason };
}

function normalize(raw) {
    const kills = Number.isInteger(raw?.kills) && raw.kills >= 0 ? Math.min(raw.kills, 100) : 0;
    const confidence = Number.isFinite(raw?.confidence) ? Math.min(Math.max(raw.confidence, 0), 1) : null;
    const epicName = typeof raw?.epicName === 'string' && raw.epicName.trim() ? raw.epicName.trim().slice(0, 64) : null;
    const reason = typeof raw?.reason === 'string' && raw.reason.trim() ? raw.reason.trim().slice(0, 500) : null;

    return { isVictory: Boolean(raw?.isVictory), kills, epicName, confidence, reason };
}

function parseJsonPayload(text, providerName) {
    if (!text || !text.trim()) {
        throw new Error(`${providerName} returned an empty response.`);
    }

    // Models occasionally wrap JSON in prose or a markdown fence.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const braced = candidate.match(/\{[\s\S]*\}/);

    return JSON.parse(braced ? braced[0] : candidate);
}

async function callOpenAiCompatible({ url, apiKey, model, extraHeaders, dataUrl, providerName }) {
    const response = await axios.post(
        url,
        {
            model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: PROMPT },
                        { type: 'image_url', image_url: { url: dataUrl } },
                    ],
                },
            ],
        },
        {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...extraHeaders },
            timeout: REQUEST_TIMEOUT_MS,
        },
    );

    return parseJsonPayload(response.data?.choices?.[0]?.message?.content, providerName);
}

async function openRouter(dataUrl) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const extraHeaders = {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://tournament.bot',
        'X-Title': 'Fortnite Tournament Verifier',
    };

    if (process.env.OPENROUTER_MODEL) {
        return callOpenAiCompatible({
            url: 'https://openrouter.ai/api/v1/chat/completions',
            apiKey,
            model: process.env.OPENROUTER_MODEL,
            extraHeaders,
            dataUrl,
            providerName: 'OpenRouter',
        });
    }

    let lastError;
    for (const model of OPENROUTER_FALLBACK_MODELS) {
        try {
            return await callOpenAiCompatible({
                url: 'https://openrouter.ai/api/v1/chat/completions',
                apiKey,
                model,
                extraHeaders,
                dataUrl,
                providerName: 'OpenRouter',
            });
        } catch (error) {
            const status = error.response?.status;
            // Only rate limits and server errors are worth retrying on another model.
            if (status !== 429 && !(status >= 500 && status < 600)) throw error;
            lastError = error;
        }
    }
    throw lastError;
}

async function groq(dataUrl) {
    return callOpenAiCompatible({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
        extraHeaders: {},
        dataUrl,
        providerName: 'Groq',
    });
}

async function gemini(imageBuffer, mime) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
            contents: [
                {
                    parts: [
                        { text: PROMPT },
                        { inlineData: { mimeType: mime, data: imageBuffer.toString('base64') } },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'object',
                    properties: {
                        isVictory: { type: 'boolean' },
                        kills: { type: 'integer' },
                        epicName: { type: 'string' },
                        confidence: { type: 'number' },
                        reason: { type: 'string' },
                    },
                    required: ['isVictory', 'kills', 'confidence'],
                },
            },
        },
        { params: { key: process.env.GEMINI_API_KEY }, timeout: REQUEST_TIMEOUT_MS },
    );

    return parseJsonPayload(response.data?.candidates?.[0]?.content?.parts?.[0]?.text, 'Gemini');
}

/**
 * Providers are tried in a fixed order, skipping any without a key, and advancing
 * on any throw so one dead provider cannot block verification.
 */
async function verifyScreenshot({ imageBuffer, mime }) {
    if (!imageBuffer || !imageBuffer.length) {
        return unavailable('No image data was provided.');
    }

    const resolvedMime = mime || 'image/jpeg';
    const dataUrl = `data:${resolvedMime};base64,${imageBuffer.toString('base64')}`;

    const providers = [
        { name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY, run: () => openRouter(dataUrl) },
        { name: 'Groq', key: process.env.GROQ_API_KEY, run: () => groq(dataUrl) },
        { name: 'Gemini', key: process.env.GEMINI_API_KEY, run: () => gemini(imageBuffer, resolvedMime) },
    ].filter((provider) => provider.key);

    if (!providers.length) {
        return unavailable('No OPENROUTER_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY is configured.');
    }

    let lastError;
    for (const provider of providers) {
        try {
            return normalize(await provider.run());
        } catch (error) {
            console.error(`${provider.name} verification failed:`, error.message);
            lastError = error;
        }
    }

    throw lastError;
}

const AUTO_CONFIDENCE = 0.99;

/**
 * Maps a verifier result onto the submission's stored AI columns. Nothing here
 * awards points; a human always confirms in the dashboard.
 */
function toDetection(result) {
    if (result.confidence === null) {
        return {
            status: 'unavailable',
            confidence: null,
            note: result.reason || 'No automatic verifier is configured.',
            predictedKills: null,
            predictedVictory: null,
            predictedEpicName: null,
        };
    }

    const shared = {
        confidence: result.confidence,
        predictedKills: Number.isInteger(result.kills) ? result.kills : null,
        predictedVictory: Boolean(result.isVictory),
        predictedEpicName: result.epicName,
    };

    if (result.confidence >= AUTO_CONFIDENCE) {
        return {
            ...shared,
            status: result.isVictory ? 'verified' : 'rejected',
            note: result.reason || null,
        };
    }

    return {
        ...shared,
        status: 'manual_review',
        note: result.reason || 'Automatic verification was not conclusive.',
    };
}

function manualReview(note) {
    return {
        status: 'manual_review',
        confidence: null,
        note,
        predictedKills: null,
        predictedVictory: null,
        predictedEpicName: null,
    };
}

module.exports = {
    AUTO_CONFIDENCE,
    PROMPT,
    manualReview,
    normalize,
    toDetection,
    unavailable,
    verifyScreenshot,
};
