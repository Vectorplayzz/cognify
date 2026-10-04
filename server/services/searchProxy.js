/**
 * Web Search Proxy — backs the chatbot's web search.
 *
 * Two providers, selected by SEARCH_PROVIDER:
 *   searxng (default) — self-hosted SearXNG on this host. No API key, no
 *                       usage cost, no third party holding our queries.
 *   exa               — hosted Exa API, if EXA_API_KEY is set.
 *
 * Both normalize to the same result shape so callers do not care which ran.
 */

const PROVIDER = (process.env.SEARCH_PROVIDER || 'searxng').toLowerCase();

const SEARXNG_URL = (process.env.SEARXNG_URL || 'http://127.0.0.1:8888').replace(/\/+$/, '');
const EXA_API_URL = process.env.EXA_API_URL || 'https://api.exa.ai/search';
const EXA_API_KEY = process.env.EXA_API_KEY || '';
const TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 20000);

const MAX_QUERY_LEN = 400;
const MAX_RESULTS = 10;

export class SearchProxyError extends Error {
    constructor(message, { status = 500, code = 'search_failed' } = {}) {
        super(message);
        this.name = 'SearchProxyError';
        this.status = status;
        this.code = code;
    }
}

function exaConfigured() {
    return Boolean(EXA_API_KEY) && EXA_API_KEY !== 'your_exa_api_key_here';
}

export function isConfigured() {
    // SearXNG needs no credentials; assume reachable and report failures
    // per-request rather than pretending search is unavailable up front.
    return PROVIDER === 'searxng' ? true : exaConfigured();
}

export function providerName() {
    return PROVIDER;
}

function validate(rawQuery, rawNumResults) {
    const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
    if (!query) {
        throw new SearchProxyError('A query is required', { status: 400, code: 'invalid_request' });
    }
    if (query.length > MAX_QUERY_LEN) {
        throw new SearchProxyError('Query is too long', { status: 400, code: 'invalid_request' });
    }
    const n = Number(rawNumResults);
    const numResults = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), MAX_RESULTS) : 5;
    return { query, numResults };
}

async function withTimeout(fn) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        return await fn(controller.signal);
    } catch (err) {
        if (err instanceof SearchProxyError) throw err;
        if (err.name === 'AbortError') {
            throw new SearchProxyError('The search provider timed out.', { status: 504, code: 'search_timeout' });
        }
        throw new SearchProxyError(`Could not reach the search provider: ${err.message}`, { status: 502, code: 'search_unreachable' });
    } finally {
        clearTimeout(timer);
    }
}

/** SearXNG returns many results from several engines, already score-ranked. */
async function searchSearxng({ query, numResults }) {
    return withTimeout(async (signal) => {
        const url = new URL(`${SEARXNG_URL}/search`);
        url.searchParams.set('q', query);
        url.searchParams.set('format', 'json');
        url.searchParams.set('safesearch', '1');

        const res = await fetch(url, {
            signal,
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
            throw new SearchProxyError(
                `The search service returned an error (${res.status}).`,
                { status: 502, code: 'search_upstream_error' }
            );
        }
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];

        return results
            .filter((r) => r.url && r.title)
            .slice(0, numResults)
            .map((r) => ({
                title: r.title,
                url: r.url,
                publishedDate: r.publishedDate || undefined,
                text: r.content || '',
                score: typeof r.score === 'number' ? r.score : undefined,
            }));
    });
}

async function searchExa({ query, numResults }) {
    if (!exaConfigured()) {
        throw new SearchProxyError('Exa is not configured', { status: 503, code: 'search_unconfigured' });
    }
    return withTimeout(async (signal) => {
        const res = await fetch(EXA_API_URL, {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_API_KEY },
            body: JSON.stringify({
                query,
                numResults,
                type: 'auto',
                contents: { text: { maxCharacters: 1000 } },
            }),
        });
        if (!res.ok) {
            throw new SearchProxyError(
                res.status === 401
                    ? 'The search provider rejected the server credentials.'
                    : `The search provider returned an error (${res.status}).`,
                { status: res.status === 429 ? 429 : 502, code: 'search_upstream_error' }
            );
        }
        const data = await res.json();
        return (Array.isArray(data?.results) ? data.results : []).map((r) => ({
            title: r.title,
            url: r.url,
            publishedDate: r.publishedDate,
            text: r.text || '',
            score: r.score,
        }));
    });
}

export async function search(rawQuery, rawNumResults) {
    const params = validate(rawQuery, rawNumResults);
    return PROVIDER === 'exa' ? searchExa(params) : searchSearxng(params);
}

/** Provider reachability, for the status endpoint. */
export async function health() {
    if (PROVIDER === 'exa') {
        return { provider: 'exa', configured: exaConfigured() };
    }
    try {
        const results = await searchSearxng({ query: 'test', numResults: 1 });
        return { provider: 'searxng', configured: true, reachable: true, url: SEARXNG_URL, sampleResults: results.length };
    } catch (err) {
        return { provider: 'searxng', configured: true, reachable: false, url: SEARXNG_URL, error: err.message };
    }
}
