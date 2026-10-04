/**
 * LLM proxy model allowlist and fallback. Upstream is stubbed via fetch.
 * Run: npm test
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.LLM_BASE_URL = 'http://127.0.0.1:1/primary/v1';
process.env.LLM_FALLBACK_BASE_URL = 'http://127.0.0.1:1/fallback/v1';
process.env.LLM_MODELS = 'model-a,model-b';
delete process.env.LLM_API_KEY;
delete process.env.VITE_LLM_API_KEY;
const { validateChatRequest, proxyChat, LlmProxyError } = await import('../services/llmProxy.js');

const msgs = [{ role: 'user', content: 'hi' }];
const realFetch = globalThis.fetch;
const realWarn = console.warn;
let attempts;

function fakeRes() {
    return {
        body: null, headersSent: false,
        on() {}, json(b) { this.body = b; this.headersSent = true; },
        writeHead() { this.headersSent = true; },
    };
}
const ok = (text) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

/** handler(base, model) -> Response | throws */
function stubUpstream(handler) {
    globalThis.fetch = async (url, init) => {
        const base = String(url).includes('/primary/') ? 'primary' : 'fallback';
        const model = JSON.parse(init.body).model;
        attempts.push(`${base}:${model}`);
        return handler(base, model);
    };
}

beforeEach(() => { attempts = []; console.warn = () => {}; });
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; });

describe('model choice', () => {
    test('a client may omit the model — the server chooses', () => {
        assert.equal(validateChatRequest({ messages: msgs }).model, null);
    });
    test('an allowed model is honoured', () => {
        assert.equal(validateChatRequest({ messages: msgs, model: 'model-b' }).model, 'model-b');
    });
    test('a model outside the allowlist is refused (no open relay)', () => {
        assert.throws(() => validateChatRequest({ messages: msgs, model: 'openai/gpt-5' }), (e) => e.code === 'model_not_allowed');
    });
    test('invalid roles are refused', () => {
        assert.throws(() => validateChatRequest({ messages: [{ role: 'tool', content: 'x' }] }), LlmProxyError);
    });
});

describe('fallback', () => {
    test('uses the first model when it works', async () => {
        stubUpstream(() => ok('A'));
        const res = fakeRes();
        await proxyChat(validateChatRequest({ messages: msgs }), res);
        assert.deepEqual(attempts, ['primary:model-a']);
        assert.equal(res.body.choices[0].message.content, 'A');
    });

    test('a failing model falls through to the next', async () => {
        stubUpstream((base, model) => (model === 'model-a' ? new Response('boom', { status: 503 }) : ok('B')));
        const res = fakeRes();
        await proxyChat(validateChatRequest({ messages: msgs }), res);
        assert.deepEqual(attempts, ['primary:model-a', 'primary:model-b']);
        assert.equal(res.body.choices[0].message.content, 'B');
    });

    test('primary unreachable (gateway down) -> fallback endpoint', async () => {
        stubUpstream((base) => { if (base === 'primary') throw new TypeError('fetch failed'); return ok('F'); });
        const res = fakeRes();
        await proxyChat(validateChatRequest({ messages: msgs }), res);
        assert.deepEqual(attempts, ['primary:model-a', 'fallback:model-a']);
        assert.equal(res.body.choices[0].message.content, 'F');
    });

    test('a non-retryable 4xx stops immediately', async () => {
        stubUpstream(() => new Response('bad', { status: 400 }));
        await assert.rejects(proxyChat(validateChatRequest({ messages: msgs }), fakeRes()), (e) => e.code === 'llm_upstream_error');
        assert.deepEqual(attempts, ['primary:model-a']);
    });

    test('an explicitly chosen model is not swapped for another', async () => {
        stubUpstream(() => new Response('down', { status: 503 }));
        await assert.rejects(proxyChat(validateChatRequest({ messages: msgs, model: 'model-b' }), fakeRes()));
        assert.deepEqual(attempts, ['primary:model-b', 'fallback:model-b']);
    });

    test('everything down -> a clear error, not a hang', async () => {
        stubUpstream(() => { throw new TypeError('fetch failed'); });
        await assert.rejects(proxyChat(validateChatRequest({ messages: msgs }), fakeRes()), (e) => e.code === 'llm_unreachable');
    });
});
