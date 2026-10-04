/**
 * AI Roadmap Fallback — used only when no roadmap.sh roadmap matches.
 *
 * This runs server-side so the LLM key stays out of the browser bundle.
 * Prefers LLM_API_KEY; falls back to the legacy VITE_LLM_API_KEY name so an
 * existing .env keeps working.
 */

const BASE_URL = (process.env.LLM_BASE_URL || process.env.VITE_LLM_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const API_KEY = process.env.LLM_API_KEY || process.env.VITE_LLM_API_KEY || '';
const MODELS = (process.env.LLM_MODELS || process.env.VITE_LLM_MODELS || '')
    .split(',').map((m) => m.trim()).filter(Boolean);
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000);
// Same fallback endpoint as the chat proxy (see llmProxy.js).
const FALLBACK_BASE_URL = (process.env.LLM_FALLBACK_BASE_URL || '').replace(/\/+$/, '');
const ENDPOINTS = [BASE_URL, FALLBACK_BASE_URL].filter((url, i, all) => url && all.indexOf(url) === i);

// Guard rails on generated structure (handout §14).
export const AI_LIMITS = {
    MIN_LEVELS: 3,
    MAX_LEVELS: 12,
    MAX_TITLE_LEN: 120,
    MAX_DESC_LEN: 600,
};

export class AiFallbackError extends Error {
    constructor(message, code = 'ai_unavailable') {
        super(message);
        this.name = 'AiFallbackError';
        this.code = code;
    }
}

// A local provider (Ollama, or a gateway on this host) needs no key.
function isLocalEndpoint(url) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}

export function isAiConfigured() {
    return Boolean(MODELS.length) && (Boolean(API_KEY) || isLocalEndpoint(BASE_URL));
}

async function callModel(model, messages, baseUrl = BASE_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // The key belongs to the primary provider only.
                ...(API_KEY && baseUrl === BASE_URL ? { Authorization: `Bearer ${API_KEY}` } : {}),
            },
            body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048 }),
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) throw new Error('empty completion');
        return content;
    } finally {
        clearTimeout(timer);
    }
}

/** Pull the first JSON array out of a completion, tolerating code fences. */
function extractJsonArray(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const match = candidate.match(/\[[\s\S]*\]/);
    if (!match) throw new AiFallbackError('Model did not return a JSON array', 'ai_invalid_output');
    try {
        return JSON.parse(match[0]);
    } catch (err) {
        throw new AiFallbackError(`Model returned malformed JSON: ${err.message}`, 'ai_invalid_output');
    }
}

/**
 * Validate generated levels before anything is shown or stored.
 * Throws AiFallbackError with code 'ai_invalid_output' on any violation.
 */
export function validateAiLevels(value) {
    if (!Array.isArray(value)) {
        throw new AiFallbackError('Generated roadmap is not a list', 'ai_invalid_output');
    }
    if (value.length < AI_LIMITS.MIN_LEVELS || value.length > AI_LIMITS.MAX_LEVELS) {
        throw new AiFallbackError(
            `Generated roadmap has ${value.length} levels (expected ${AI_LIMITS.MIN_LEVELS}-${AI_LIMITS.MAX_LEVELS})`,
            'ai_invalid_output'
        );
    }

    return value.map((item, i) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new AiFallbackError(`Level ${i + 1} is not an object`, 'ai_invalid_output');
        }
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        if (!title) {
            throw new AiFallbackError(`Level ${i + 1} has no title`, 'ai_invalid_output');
        }
        if (title.length > AI_LIMITS.MAX_TITLE_LEN) {
            throw new AiFallbackError(`Level ${i + 1} title is too long`, 'ai_invalid_output');
        }
        const description = typeof item.description === 'string' ? item.description.trim() : '';
        if (description.length > AI_LIMITS.MAX_DESC_LEN) {
            throw new AiFallbackError(`Level ${i + 1} description is too long`, 'ai_invalid_output');
        }
        const xp = Number(item.xpReward);
        return {
            title,
            description,
            xpReward: Number.isFinite(xp) && xp > 0 && xp <= 10000 ? Math.trunc(xp) : undefined,
        };
    });
}

/**
 * Generate a roadmap for an unsupported topic.
 * Tries each configured model in turn; returns { levels, provider }.
 */
export async function generateRoadmapWithAi(topic) {
    if (!isAiConfigured()) {
        throw new AiFallbackError('No AI provider is configured', 'ai_unavailable');
    }

    const messages = [
        {
            role: 'system',
            content: 'You are an expert curriculum designer. Return ONLY a valid JSON array, no markdown, no commentary.',
        },
        {
            role: 'user',
            content: `Create a 6-level learning roadmap for "${topic}" progressing beginner to advanced. `
                + 'Respond with JSON only: [{"title":"...","description":"...","xpReward":100}]. '
                + 'XP starts at 100 and increases by 50 each level.',
        },
    ];

    const failures = [];
    let sawTransportFailure = false;
    for (const baseUrl of ENDPOINTS) {
        let endpointReachable = false;
        for (const model of MODELS) {
            try {
                const raw = await callModel(model, messages, baseUrl);
                endpointReachable = true;
                const levels = validateAiLevels(extractJsonArray(raw));
                return { levels, provider: model };
            } catch (err) {
                // An invalid response from one model is worth retrying on the next.
                failures.push(`${model}: ${err.message}`);
                if (err instanceof AiFallbackError && err.code === 'ai_invalid_output') {
                    endpointReachable = true;
                } else {
                    sawTransportFailure = true;
                }
            }
        }
        // Every model answered but none produced usable output: another
        // endpoint serving the same models will not do better.
        if (endpointReachable && !sawTransportFailure) break;
    }

    // If every model answered but none produced usable output, that is a
    // validation problem, not an outage — the caller reports them differently.
    throw new AiFallbackError(
        `All AI providers failed (${failures.join('; ')})`,
        sawTransportFailure ? 'ai_unavailable' : 'ai_invalid_output'
    );
}
