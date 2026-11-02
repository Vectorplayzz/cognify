/**
 * LLM Proxy — forwards chat completions to the configured provider using a
 * server-side key, so no API key is ever shipped in the browser bundle.
 *
 * Supports both buffered and streaming (SSE) responses.
 */
import { Readable } from 'stream';

const BASE_URL = (process.env.LLM_BASE_URL || process.env.VITE_LLM_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const API_KEY = process.env.LLM_API_KEY || process.env.VITE_LLM_API_KEY || '';
const ALLOWED_MODELS = (process.env.LLM_MODELS || process.env.VITE_LLM_MODELS || '')
    .split(',').map((m) => m.trim()).filter(Boolean);
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 120000);
// Optional second endpoint tried when the primary is unreachable — e.g. the
// primary is the OmniRoute gateway and this is Ollama directly, so the
// gateway going down does not take every AI feature with it.
const FALLBACK_BASE_URL = (process.env.LLM_FALLBACK_BASE_URL || '').replace(/\/+$/, '');

const STREAM_IDLE_MS = Number(process.env.LLM_STREAM_IDLE_MS || 60000);

const MAX_MESSAGES = 60;
const MAX_CONTENT_BYTES = 128 * 1024; // whole conversation

export class LlmProxyError extends Error {
    constructor(message, { status = 500, code = 'llm_failed' } = {}) {
        super(message);
        this.name = 'LlmProxyError';
        this.status = status;
        this.code = code;
    }
}

// Some providers need no credentials (a local Ollama, or a self-hosted
// gateway on this host). Those are configured as long as a model is set.
function isLocalEndpoint(url) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}

export function isConfigured() {
    return Boolean(API_KEY) || isLocalEndpoint(BASE_URL);
}

/** Auth header for an endpoint. The key belongs to the primary provider only. */
function authHeaders(baseUrl = BASE_URL) {
    return API_KEY && baseUrl === BASE_URL ? { Authorization: `Bearer ${API_KEY}` } : {};
}

function endpoints() {
    return [BASE_URL, FALLBACK_BASE_URL].filter((url, i, all) => url && all.indexOf(url) === i);
}

// Worth trying the next model/endpoint: the provider is down, overloaded, or
// does not have this model. Other 4xx are the request's fault and would fail again.
const isRetryableStatus = (status) => status >= 500 || status === 404 || status === 429;

/**
 * Per-model request tweaks. Reasoning models (gpt-oss, qwen3) otherwise
 * spend the token budget thinking and can return an empty answer; Groq
 * accepts these knobs on its OpenAI-compatible API.
 */
function modelParams(model) {
    if (/^openai\/gpt-oss/.test(model)) return { reasoning_effort: 'low' };
    if (/^qwen\/qwen3/.test(model)) return { reasoning_effort: 'none' };
    return {};
}

/** Validate the client's request before spending an upstream call. */
export function validateChatRequest(body) {
    if (!body || typeof body !== 'object') {
        throw new LlmProxyError('Request body must be a JSON object', { status: 400, code: 'invalid_request' });
    }
    const { messages, model, temperature, max_tokens: maxTokens, stream } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
        throw new LlmProxyError('messages must be a non-empty array', { status: 400, code: 'invalid_request' });
    }
    if (messages.length > MAX_MESSAGES) {
        throw new LlmProxyError(`Conversation exceeds ${MAX_MESSAGES} messages`, { status: 400, code: 'invalid_request' });
    }

    let total = 0;
    const clean = messages.map((m, i) => {
        if (!m || typeof m !== 'object') {
            throw new LlmProxyError(`Message ${i} is not an object`, { status: 400, code: 'invalid_request' });
        }
        const role = m.role;
        if (!['system', 'user', 'assistant'].includes(role)) {
            throw new LlmProxyError(`Message ${i} has an invalid role`, { status: 400, code: 'invalid_request' });
        }
        const content = typeof m.content === 'string' ? m.content : '';
        total += Buffer.byteLength(content, 'utf-8');
        return { role, content };
    });

    if (total > MAX_CONTENT_BYTES) {
        throw new LlmProxyError('Conversation is too large', { status: 413, code: 'payload_too_large' });
    }

    // The server owns model choice. A client may name a model, but only one
    // this deployment opted into, so the endpoint cannot be used as an open
    // relay to arbitrary paid models. With no model named, proxyChat tries
    // each allowed model in order.
    const requested = typeof model === 'string' && model.trim() ? model.trim() : null;
    if (requested && ALLOWED_MODELS.length && !ALLOWED_MODELS.includes(requested)) {
        throw new LlmProxyError(`Model "${requested}" is not permitted`, { status: 400, code: 'model_not_allowed' });
    }
    if (!requested && ALLOWED_MODELS.length === 0) {
        throw new LlmProxyError('No model is configured', { status: 503, code: 'llm_unconfigured' });
    }

    const temp = Number(temperature);
    const tokens = Number(maxTokens);

    return {
        messages: clean,
        model: requested,
        temperature: Number.isFinite(temp) ? Math.min(Math.max(temp, 0), 2) : 0.7,
        max_tokens: Number.isFinite(tokens) ? Math.min(Math.max(Math.trunc(tokens), 1), 8192) : 2048,
        stream: Boolean(stream),
    };
}

/**
 * Forward a validated request upstream and write the result to `res`.
 * Streaming responses are piped through untouched so the client can consume
 * the provider's SSE format directly.
 *
 * Tries each candidate model on each endpoint in turn, but only while nothing
 * has been sent to the client — a stream that has started is never retried.
 */
export async function proxyChat(payload, res) {
    if (!isConfigured()) {
        throw new LlmProxyError('No AI provider is configured', { status: 503, code: 'llm_unconfigured' });
    }

    const models = payload.model ? [payload.model] : ALLOWED_MODELS;
    const deadline = Date.now() + TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    // Stop paying for a stream the client has abandoned.
    res.on('close', () => controller.abort());

    let lastError = null;
    try {
        for (const baseUrl of endpoints()) {
            for (const model of models) {
                if (Date.now() >= deadline) break;
                let upstream;
                try {
                    upstream = await fetch(`${baseUrl}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders(baseUrl), 'X-Title': 'Cognify' },
                        body: JSON.stringify({ ...payload, ...modelParams(model), model }),
                        signal: controller.signal,
                    });
                } catch (err) {
                    if (err.name === 'AbortError') {
                        throw new LlmProxyError('The AI provider timed out.', { status: 504, code: 'llm_timeout' });
                    }
                    // Endpoint unreachable: no point trying other models on it.
                    lastError = new LlmProxyError(`Could not reach the AI provider: ${err.message}`, { status: 502, code: 'llm_unreachable' });
                    console.warn(`[LLM] ${baseUrl} unreachable (${err.message})`);
                    break;
                }

                if (!upstream.ok) {
                    const detail = await upstream.text().catch(() => '');
                    lastError = new LlmProxyError(
                        upstream.status === 401
                            ? 'The AI provider rejected the server credentials.'
                            : `The AI provider returned an error (${upstream.status}).`,
                        { status: upstream.status === 429 ? 429 : 502, code: 'llm_upstream_error', detail }
                    );
                    // Bad credentials are a property of the endpoint, not the
                    // model: skip to the fallback endpoint, if any.
                    if (upstream.status === 401 || upstream.status === 403) {
                        console.warn(`[LLM] ${baseUrl} rejected credentials (${upstream.status}); trying next endpoint`);
                        break;
                    }
                    if (!isRetryableStatus(upstream.status)) throw lastError;
                    console.warn(`[LLM] ${model} @ ${baseUrl} returned ${upstream.status}; trying next`);
                    continue;
                }

                if (payload.stream && upstream.body) {
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache, no-transform',
                        Connection: 'keep-alive',
                        'X-Accel-Buffering': 'no', // tell nginx not to buffer the stream
                    });
                    recordOutcome(true);
                    // The overall deadline covers getting a first response; once
                    // tokens flow, only a stall (no data for STREAM_IDLE_MS) aborts.
                    clearTimeout(timer);
                    let idle = setTimeout(() => controller.abort(), STREAM_IDLE_MS);
                    try {
                        await new Promise((resolve, reject) => {
                            const node = Readable.fromWeb(upstream.body);
                            node.on('data', () => {
                                clearTimeout(idle);
                                idle = setTimeout(() => controller.abort(), STREAM_IDLE_MS);
                            });
                            node.on('error', reject);
                            node.on('end', resolve);
                            node.pipe(res, { end: false });
                        });
                    } catch (err) {
                        // Headers are sent: tell the client in-band instead of a silent cut.
                        if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: { message: 'The AI stream was interrupted.' } })}\n\n`);
                    } finally {
                        clearTimeout(idle);
                        if (!res.writableEnded) res.end();
                    }
                    return;
                }

                recordOutcome(true);
                res.json(await upstream.json());
                return;
            }
        }
        throw lastError || new LlmProxyError('The AI provider timed out.', { status: 504, code: 'llm_timeout' });
    } catch (err) {
        recordOutcome(false, err?.message);
        if (err instanceof LlmProxyError) throw err;
        if (err.name === 'AbortError') {
            throw new LlmProxyError('The AI provider timed out.', { status: 504, code: 'llm_timeout' });
        }
        throw new LlmProxyError(`Could not reach the AI provider: ${err.message}`, { status: 502, code: 'llm_unreachable' });
    } finally {
        clearTimeout(timer);
    }
}

export { ALLOWED_MODELS };

// ── Health for /api/llm/status ──
// "The endpoint answers" is not the same as "the AI works" (an endpoint can
// list models yet reject every completion), so health comes from real
// outcomes: the latest proxied request, or a one-token test completion when
// there has been no traffic recently. Cached; the route is public.
const health = { lastOkAt: 0, lastFailAt: 0, lastError: '' };
export function recordOutcome(ok, error = '') {
    if (ok) health.lastOkAt = Date.now();
    else { health.lastFailAt = Date.now(); health.lastError = String(error).slice(0, 200); }
}

let probeCache = { at: 0, value: null };
const RECENT_MS = 10 * 60 * 1000;

async function testCompletion() {
    for (const baseUrl of endpoints()) {
        for (const model of ALLOWED_MODELS.length ? ALLOWED_MODELS : ['']) {
            try {
                const r = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders(baseUrl) },
                    body: JSON.stringify({ model, ...modelParams(model), messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 16, stream: false }),
                    signal: AbortSignal.timeout(15000),
                });
                if (r.ok) return { ok: true };
            } catch { /* try next */ }
        }
    }
    return { ok: false };
}

export async function probe() {
    if (!isConfigured()) return { available: false, reason: 'unconfigured' };
    const now = Date.now();
    const latest = Math.max(health.lastOkAt, health.lastFailAt);
    if (latest && now - latest < RECENT_MS) {
        return { available: health.lastOkAt >= health.lastFailAt, reason: health.lastOkAt >= health.lastFailAt ? 'ok' : 'upstream_error', checkedAt: new Date(latest).toISOString() };
    }
    if (probeCache.value && now - probeCache.at < RECENT_MS) return probeCache.value;
    const t = await testCompletion();
    recordOutcome(t.ok, t.ok ? '' : 'test completion failed');
    probeCache = { at: now, value: { available: t.ok, reason: t.ok ? 'ok' : 'upstream_error', checkedAt: new Date(now).toISOString() } };
    return probeCache.value;
}
