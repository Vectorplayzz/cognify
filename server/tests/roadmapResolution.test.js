/**
 * getRoadmap() end to end with the network stubbed (handout §16, §17):
 * roadmap.sh available, roadmap.sh down with and without a cached snapshot,
 * AI fallback, and AI failure. No real network or LLM calls are made.
 * Run: npm test
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Configure before the modules read their environment at import time.
const CACHE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'cognify-roadmap-test-'));
process.env.ROADMAP_CACHE_DIR = CACHE_DIR;
process.env.LLM_BASE_URL = 'http://llm.test/v1';
process.env.LLM_MODELS = 'model-a';
delete process.env.LLM_FALLBACK_BASE_URL;
// A remote provider only counts as configured with a key.
process.env.LLM_API_KEY = 'test-key';

const TREE_URL = /api\.github\.com\/repos\/.+\/git\/trees\//;
const GRAPH_URL = /roadmap\.sh\/frontend\.json$/;
const CONTENTS_URL = /api\.github\.com\/repos\/.+\/contents\/roadmaps\/frontend\/content$/;
const LLM_URL = /llm\.test\/v1\/chat\/completions$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TREE = { tree: [{ path: 'roadmaps/frontend/content' }, { path: 'roadmaps/backend/content' }] };
const GRAPH = {
    title: { page: 'Frontend Developer' },
    nodes: [
        { id: 'n1', type: 'topic', data: { label: 'HTML' }, position: { x: 0, y: 0 } },
        { id: 'n2', type: 'topic', data: { label: 'CSS' }, position: { x: 0, y: 100 } },
    ],
    edges: [],
};
const AI_LEVELS = JSON.stringify([
    { title: 'Basics', description: 'd', xpReward: 100 },
    { title: 'Intermediate', description: 'd', xpReward: 150 },
    { title: 'Advanced', description: 'd', xpReward: 200 },
]);
const aiReply = (content) => json({ choices: [{ message: { content } }] });

const realFetch = globalThis.fetch;
const realLog = console.log;
let calls;
let version = 0;

/** Route each URL to a handler; anything unrouted is a network failure. */
function stubNetwork(routes) {
    globalThis.fetch = async (url) => {
        const href = String(url);
        calls.push(href);
        for (const [pattern, handler] of routes) {
            if (pattern.test(href)) return handler();
        }
        throw new TypeError(`fetch failed (unrouted in test: ${href})`);
    };
}
const down = () => { throw new TypeError('fetch failed'); };

/** A fresh module instance, so the in-memory catalog memo starts empty. */
const load = () => import(`../services/roadmap/index.js?test=${++version}`);

async function writeCache(key, data, { stale }) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cachedAt = stale ? 0 : Date.now();
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify({ cachedAt, data }));
}

beforeEach(async () => {
    calls = [];
    console.log = () => {};
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
});
afterEach(() => {
    globalThis.fetch = realFetch;
    console.log = realLog;
});

describe('roadmap.sh available', () => {
    test('existing topic is served from roadmap.sh, never AI', async () => {
        stubNetwork([
            [TREE_URL, () => json(TREE)],
            [GRAPH_URL, () => json(GRAPH)],
            [CONTENTS_URL, () => json([])],
            [LLM_URL, () => assert.fail('AI must not be called for a curated topic')],
        ]);
        const { getRoadmap } = await load();
        const { source, roadmap } = await getRoadmap('Frontend Developer');
        assert.equal(source, 'roadmap.sh');
        assert.equal(roadmap.sourceUrl, 'https://roadmap.sh/frontend');
        assert.deepEqual(roadmap.levels.map((l) => l.title), ['HTML', 'CSS']);
    });

    test('a successful sync is cached, so the next request needs no network', async () => {
        stubNetwork([[TREE_URL, () => json(TREE)], [GRAPH_URL, () => json(GRAPH)], [CONTENTS_URL, () => json([])]]);
        await (await load()).getRoadmap('frontend');
        stubNetwork([]); // everything offline now
        const { source } = await (await load()).getRoadmap('frontend');
        assert.equal(source, 'roadmap.sh');
    });

    test('unsupported topic goes to AI and is validated', async () => {
        stubNetwork([[TREE_URL, () => json(TREE)], [LLM_URL, () => aiReply(AI_LEVELS)]]);
        const { source, roadmap } = await (await load()).getRoadmap('Medieval Falconry');
        assert.equal(source, 'ai');
        assert.equal(roadmap.levels.length, 3);
        assert.equal(roadmap.sourceProvider, 'model-a');
    });
});

describe('roadmap.sh unavailable', () => {
    test('catalog down, no snapshot: falls back to AI instead of failing', async () => {
        stubNetwork([[TREE_URL, down], [LLM_URL, () => aiReply(AI_LEVELS)]]);
        const { source } = await (await load()).getRoadmap('frontend');
        assert.equal(source, 'ai');
    });

    test('catalog down, stale snapshot: keeps using the snapshot', async () => {
        await writeCache('_catalog', ['frontend'], { stale: true });
        await writeCache('frontend', { source: 'roadmap.sh', sourceSlug: 'frontend', sourceUrl: 'https://roadmap.sh/frontend', title: 'Frontend', description: '', levels: [{ id: 'x', title: 'Cached level' }] }, { stale: true });
        stubNetwork([[LLM_URL, () => assert.fail('a usable snapshot must win over AI')]]);
        const { source, roadmap } = await (await load()).getRoadmap('frontend');
        assert.equal(source, 'roadmap.sh');
        assert.equal(roadmap.levels[0].title, 'Cached level');
    });

    test('roadmap graph down, no snapshot: falls back to AI', async () => {
        stubNetwork([[TREE_URL, () => json(TREE)], [GRAPH_URL, () => json({}, 503)], [LLM_URL, () => aiReply(AI_LEVELS)]]);
        const { source } = await (await load()).getRoadmap('frontend');
        assert.equal(source, 'ai');
    });

    test('a failed sync never overwrites a working snapshot', async () => {
        const snapshot = { source: 'roadmap.sh', title: 'Frontend', levels: [{ id: 'x', title: 'Good' }] };
        await writeCache('_catalog', ['frontend'], { stale: false });
        await writeCache('frontend', snapshot, { stale: true });
        stubNetwork([[GRAPH_URL, () => json({ nodes: 'broken' })]]); // malformed upstream
        await (await load()).getRoadmap('frontend');
        const onDisk = JSON.parse(await fs.readFile(path.join(CACHE_DIR, 'frontend.json'), 'utf-8'));
        assert.equal(onDisk.data.levels[0].title, 'Good');
    });
});

describe('AI failure', () => {
    test('AI unreachable -> 503 with a clear message', async () => {
        stubNetwork([[TREE_URL, () => json(TREE)], [LLM_URL, down]]);
        await assert.rejects((await load()).getRoadmap('Medieval Falconry'), (err) =>
            err.name === 'RoadmapError' && err.status === 503 && /No roadmap source/.test(err.message));
    });

    test('AI returns malformed output -> 502 validation error', async () => {
        stubNetwork([[TREE_URL, () => json(TREE)], [LLM_URL, () => aiReply('Sure! Here is a roadmap: not json')]]);
        await assert.rejects((await load()).getRoadmap('Medieval Falconry'), (err) =>
            err.status === 502 && err.code === 'ai_invalid_output');
    });

    test('invalid topics are rejected before any network call', async () => {
        stubNetwork([]);
        await assert.rejects((await load()).getRoadmap('   '), (err) => err.status === 400);
        await assert.rejects((await load()).getRoadmap('x'.repeat(200)), (err) => err.status === 400);
        assert.equal(calls.length, 0);
    });
});
