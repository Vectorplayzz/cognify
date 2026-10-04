/**
 * Roadmap unit tests (handout §17, §38) — pure logic only, no network.
 * Run: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSlug, normalizeTopic } from '../services/roadmap/roadmapCatalog.js';
import { parseRoadmapGraph, extractContent } from '../services/roadmap/roadmapParser.js';
import { normalizeRoadmap, normalizeAiRoadmap, xpForLevel } from '../services/roadmap/roadmapNormalizer.js';
import { validateAiLevels, AiFallbackError, AI_LIMITS } from '../services/roadmap/aiRoadmapFallback.js';

// A representative subset of the live roadmap.sh catalog.
const SLUGS = [
    'frontend', 'backend', 'full-stack', 'javascript', 'typescript', 'python',
    'golang', 'react', 'react-native', 'vue', 'angular', 'nodejs', 'nextjs',
    'cpp', 'java', 'rust', 'aspnet-core', 'spring-boot', 'swift-ui', 'devops',
    'kubernetes', 'machine-learning', 'ai-engineer', 'postgresql-dba', 'cyber-security',
];

const slugOf = (topic) => resolveSlug(topic, SLUGS)?.slug ?? null;

describe('topic resolution — existing roadmaps', () => {
    for (const [topic, slug] of [
        ['frontend', 'frontend'],
        ['Frontend Developer', 'frontend'],
        ['become a devops engineer', 'devops'],
        ['python developer', 'python'],
        ['Full Stack', 'full-stack'],
        ['postgresql dba', 'postgresql-dba'],
    ]) {
        test(`"${topic}" -> ${slug}`, () => assert.equal(slugOf(topic), slug));
    }
});

describe('topic resolution — aliases', () => {
    for (const [topic, slug] of [
        ['js', 'javascript'],
        ['k8s', 'kubernetes'],
        ['ML', 'machine-learning'],
        ['front end', 'frontend'],
        ['go', 'golang'],
        ['c++', 'cpp'],
        ['C++ developer', 'cpp'],
        ['c#', 'aspnet-core'],
        ['spring', 'spring-boot'],
    ]) {
        test(`"${topic}" -> ${slug}`, () => assert.equal(slugOf(topic), slug));
    }
});

describe('topic resolution — JavaScript-ecosystem spellings', () => {
    // Regression: these all fell through to AI generation before the
    // js-suffix step, despite roadmap.sh having curated roadmaps for them.
    for (const [topic, slug] of [
        ['react.js', 'react'],
        ['reactjs', 'react'],
        ['React JS', 'react'],
        ['vue.js', 'vue'],
        ['node.js', 'nodejs'],
        ['Node JS developer', 'nodejs'],
        ['next.js', 'nextjs'],
    ]) {
        test(`"${topic}" -> ${slug}`, () => assert.equal(slugOf(topic), slug));
    }

    test('"react native" still resolves to react-native, not react', () => {
        assert.equal(slugOf('react native'), 'react-native');
    });
    test('bare "js" stays javascript', () => assert.equal(slugOf('js'), 'javascript'));
});

describe('topic resolution — unsupported topics fall back to AI', () => {
    for (const topic of ['Sourdough Robotics', 'medieval falconry', 'quantum basket weaving', '   ']) {
        test(`"${topic}" -> null`, () => assert.equal(slugOf(topic), null));
    }
    test('no fuzzy guessing: a partial word does not match', () => {
        assert.equal(slugOf('reac'), null);
    });
});

test('normalizeTopic strips punctuation but keeps + and #', () => {
    assert.equal(normalizeTopic('  React.JS!! '), 'react js');
    assert.equal(normalizeTopic('C++'), 'c++');
    assert.equal(normalizeTopic('C#'), 'c#');
});

describe('roadmap.sh graph parsing and transformation', () => {
    const graph = {
        title: { page: 'Frontend Developer' },
        nodes: [
            { id: 't2', type: 'topic', data: { label: 'CSS' }, position: { x: 0, y: 200 } },
            { id: 't1', type: 'topic', data: { label: 'HTML' }, position: { x: 0, y: 0 } },
            { id: 's1', type: 'subtopic', data: { label: 'Semantic HTML' }, position: { x: 300, y: 10 } },
            { id: 's2', type: 'subtopic', data: { label: 'Flexbox' }, position: { x: 300, y: 210 } },
            { id: 'x', type: 'label', data: { label: 'ignored' }, position: { x: 0, y: 50 } },
        ],
        edges: [{ source: 't1', target: 's1' }],
    };

    test('orders topics top-to-bottom and attaches subtopics', () => {
        const parsed = parseRoadmapGraph(graph, 'frontend');
        assert.equal(parsed.title, 'Frontend Developer');
        assert.deepEqual(parsed.topics.map((t) => t.title), ['HTML', 'CSS']);
        assert.deepEqual(parsed.topics[0].subtopics.map((s) => s.title), ['Semantic HTML']);
        // s2 has no edge — attached geometrically to the topic above it.
        assert.deepEqual(parsed.topics[1].subtopics.map((s) => s.title), ['Flexbox']);
    });

    test('rejects a graph with no topic nodes', () => {
        assert.throws(() => parseRoadmapGraph({ nodes: [], edges: [] }, 'empty'), /no topic nodes/);
    });

    test('transforms into the Cognify schema with source attribution', () => {
        const parsed = parseRoadmapGraph(graph, 'frontend');
        const contents = new Map([['t1', { heading: 'HTML', body: 'HTML structures web pages.' }]]);
        const roadmap = normalizeRoadmap({ parsed, contents, slug: 'frontend', topicQuery: 'frontend' });

        assert.equal(roadmap.source, 'roadmap.sh');
        assert.equal(roadmap.sourceSlug, 'frontend');
        assert.equal(roadmap.sourceUrl, 'https://roadmap.sh/frontend');
        assert.equal(roadmap.levels.length, 2);

        const [first, second] = roadmap.levels;
        for (const key of ['id', 'order', 'title', 'description', 'theoryContent', 'subtopics', 'imageQuery', 'xpReward', 'quiz']) {
            assert.ok(key in first, `level is missing "${key}"`);
        }
        assert.equal(first.description, 'HTML structures web pages.');
        assert.equal(first.xpReward, xpForLevel(1));
        assert.match(second.description, /Flexbox/); // no own prose -> summarizes subtopics
    });

    test('extractContent drops the heading and the trailing resource links', () => {
        const md = '# Flexbox\n\nFlexbox lays out items in one dimension.\n\nVisit the following resources to learn more:\n\n- [MDN](https://example.com)';
        assert.deepEqual(extractContent(md), { heading: 'Flexbox', body: 'Flexbox lays out items in one dimension.' });
    });
});

describe('AI fallback validation', () => {
    const level = (n) => ({ title: `Level ${n}`, description: 'd', xpReward: 100 });
    const levels = (count) => Array.from({ length: count }, (_, i) => level(i + 1));

    test('accepts a well-formed roadmap', () => {
        const out = validateAiLevels(levels(AI_LIMITS.MIN_LEVELS));
        assert.equal(out.length, AI_LIMITS.MIN_LEVELS);
        assert.equal(out[0].title, 'Level 1');
    });

    const rejects = (value, pattern) =>
        assert.throws(() => validateAiLevels(value), (err) => err instanceof AiFallbackError && err.code === 'ai_invalid_output' && pattern.test(err.message));

    test('rejects non-array output', () => rejects({ levels: [] }, /not a list/));
    test('rejects too few levels', () => rejects(levels(AI_LIMITS.MIN_LEVELS - 1), /levels/));
    test('rejects too many levels', () => rejects(levels(AI_LIMITS.MAX_LEVELS + 1), /levels/));
    test('rejects a level with no title', () => rejects([...levels(AI_LIMITS.MIN_LEVELS - 1), { description: 'x' }], /no title/));
    test('rejects an over-long title', () => rejects([...levels(AI_LIMITS.MIN_LEVELS - 1), { title: 'x'.repeat(AI_LIMITS.MAX_TITLE_LEN + 1) }], /too long/));
    test('rejects a non-object level', () => rejects([...levels(AI_LIMITS.MIN_LEVELS - 1), 'oops'], /not an object/));

    test('drops an implausible xpReward instead of trusting it', () => {
        const input = levels(AI_LIMITS.MIN_LEVELS);
        input[0].xpReward = 999999;
        assert.equal(validateAiLevels(input)[0].xpReward, undefined);
    });

    test('normalizeAiRoadmap produces the same level shape as roadmap.sh', () => {
        const roadmap = normalizeAiRoadmap({ levels: validateAiLevels(levels(AI_LIMITS.MIN_LEVELS)), topic: 'Falconry', provider: 'test' });
        assert.equal(roadmap.source, 'ai');
        assert.equal(roadmap.levels[0].xpReward, 100);
        assert.equal(roadmap.levels[1].order, 2);
        assert.deepEqual(roadmap.levels[0].quiz, []);
    });
});
