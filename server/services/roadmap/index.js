/**
 * Roadmap Service — the single entry point for "get me a roadmap".
 *
 *   getRoadmap(topic)
 *        -> resolve topic to a roadmap.sh slug
 *        -> if matched: fetch + normalize upstream content (cached)
 *        -> otherwise:  existing AI generator, schema validated
 *        -> if both fail: controlled error
 *
 * Callers never learn where the roadmap came from beyond the `source` field.
 */
import { resolveSlug, humanizeSlug, normalizeTopic } from './roadmapCatalog.js';
import {
    fetchCatalogSlugs, fetchRoadmapGraph, fetchContentIndex, fetchContentMarkdown,
    RoadmapSourceError,
} from './roadmapSource.js';
import { parseRoadmapGraph, extractContent } from './roadmapParser.js';
import { normalizeRoadmap, normalizeAiRoadmap } from './roadmapNormalizer.js';
import * as cache from './roadmapCache.js';
import { generateRoadmapWithAi, AiFallbackError, isAiConfigured } from './aiRoadmapFallback.js';

const CATALOG_KEY = '_catalog';
const CATALOG_TTL_MS = Number(process.env.ROADMAP_CATALOG_TTL_MS || 24 * 60 * 60 * 1000);
// Content files are fetched in parallel, but politely.
const CONTENT_CONCURRENCY = Number(process.env.ROADMAP_CONTENT_CONCURRENCY || 8);

function log(event, fields = {}) {
    console.log(`\x1b[2m${new Date().toISOString()}\x1b[0m \x1b[34m[roadmap]\x1b[0m ${JSON.stringify({ event, ...fields })}`);
}

export class RoadmapError extends Error {
    constructor(message, { status = 500, code = 'roadmap_failed' } = {}) {
        super(message);
        this.name = 'RoadmapError';
        this.status = status;
        this.code = code;
    }
}

let catalogMemo = { slugs: null, at: 0 };

/**
 * The roadmap slug catalog, built from upstream and cached on disk.
 * A stale snapshot is preferred over failing when upstream is unreachable.
 */
export async function getCatalog({ force = false } = {}) {
    if (!force && catalogMemo.slugs && Date.now() - catalogMemo.at < CATALOG_TTL_MS) {
        return catalogMemo.slugs;
    }

    const cached = await cache.read(CATALOG_KEY);
    if (!force && cached && !cached.stale) {
        catalogMemo = { slugs: cached.data, at: Date.now() };
        return cached.data;
    }

    try {
        const slugs = await fetchCatalogSlugs();
        await cache.write(CATALOG_KEY, slugs);
        catalogMemo = { slugs, at: Date.now() };
        log('catalog.synced', { count: slugs.length });
        return slugs;
    } catch (err) {
        if (cached?.data) {
            // Never discard a working snapshot because a sync failed.
            log('catalog.sync_failed_using_cache', { error: err.message, count: cached.data.length });
            catalogMemo = { slugs: cached.data, at: Date.now() };
            return cached.data;
        }
        log('catalog.unavailable', { error: err.message });
        throw err;
    }
}

/** Fetch every content file for a roadmap, joined to its graph node id. */
async function loadContents(slug, nodeIds) {
    const index = await fetchContentIndex(slug);
    const wanted = [...nodeIds].filter((id) => index.has(id));
    const contents = new Map();

    for (let i = 0; i < wanted.length; i += CONTENT_CONCURRENCY) {
        const batch = wanted.slice(i, i + CONTENT_CONCURRENCY);
        const results = await Promise.allSettled(
            batch.map(async (id) => {
                const md = await fetchContentMarkdown(index.get(id).downloadUrl);
                return [id, extractContent(md)];
            })
        );
        for (const r of results) {
            // A missing content file degrades that topic to title-only; it
            // should not fail the whole roadmap.
            if (r.status === 'fulfilled') contents.set(r.value[0], r.value[1]);
        }
    }
    return contents;
}

/** Build a normalized roadmap.sh roadmap, using the disk cache when fresh. */
async function buildFromSource(slug, topic) {
    const cached = await cache.read(slug);
    if (cached && !cached.stale) {
        log('source.cache_hit', { slug });
        return cached.data;
    }

    try {
        const graph = await fetchRoadmapGraph(slug);
        const parsed = parseRoadmapGraph(graph, slug);
        const nodeIds = new Set();
        for (const t of parsed.topics) {
            nodeIds.add(t.id);
            for (const s of t.subtopics) nodeIds.add(s.id);
        }
        const contents = await loadContents(slug, nodeIds);
        const roadmap = normalizeRoadmap({ parsed, contents, slug, topicQuery: topic });

        if (!roadmap.levels.length) {
            throw new RoadmapSourceError(`Roadmap "${slug}" normalized to zero levels`);
        }

        await cache.write(slug, roadmap);
        log('source.synced', { slug, levels: roadmap.levels.length, contents: contents.size });
        return roadmap;
    } catch (err) {
        if (cached?.data) {
            // Upstream broke, but we have a previously valid snapshot.
            log('source.failed_using_stale_cache', { slug, error: err.message });
            return cached.data;
        }
        throw err;
    }
}

/**
 * Resolve a topic to a roadmap.
 * Returns { source, roadmap, resolution }.
 */
export async function getRoadmap(topic) {
    const cleaned = String(topic || '').trim();
    if (!cleaned) {
        throw new RoadmapError('A topic is required', { status: 400, code: 'invalid_topic' });
    }
    if (cleaned.length > 120) {
        throw new RoadmapError('Topic is too long', { status: 400, code: 'invalid_topic' });
    }

    // ── 1. roadmap.sh ──
    let match = null;
    try {
        const slugs = await getCatalog();
        match = resolveSlug(cleaned, slugs);
    } catch (err) {
        // Catalog unavailable: fall through to AI rather than failing outright.
        log('resolve.catalog_unavailable', { topic: cleaned, error: err.message });
    }

    if (match) {
        log('resolve.matched', { topic: cleaned, slug: match.slug, matchedBy: match.matchedBy });
        try {
            const roadmap = await buildFromSource(match.slug, cleaned);
            return {
                source: 'roadmap.sh',
                roadmap,
                resolution: { ...match, title: roadmap.title || humanizeSlug(match.slug) },
            };
        } catch (err) {
            log('source.unavailable_falling_back', { slug: match.slug, error: err.message });
            // fall through to AI
        }
    } else {
        log('resolve.no_match', { topic: cleaned, normalized: normalizeTopic(cleaned) });
    }

    // ── 2. AI fallback ──
    try {
        const { levels, provider } = await generateRoadmapWithAi(cleaned);
        log('ai.generated', { topic: cleaned, provider, levels: levels.length });
        return {
            source: 'ai',
            roadmap: normalizeAiRoadmap({ levels, topic: cleaned, provider }),
            resolution: { matchedBy: 'ai', confidence: 0 },
        };
    } catch (err) {
        // ── 3. controlled failure ──
        const invalid = err instanceof AiFallbackError && err.code === 'ai_invalid_output';
        log('ai.failed', { topic: cleaned, error: err.message, code: err.code });
        throw new RoadmapError(
            invalid
                ? 'The generated roadmap failed validation. Please try a different topic.'
                : 'No roadmap source is currently available for this topic.',
            { status: invalid ? 502 : 503, code: err.code || 'roadmap_unavailable' }
        );
    }
}

/** Catalog listing for the topic picker. */
export async function listCatalog() {
    const slugs = await getCatalog();
    return slugs.map((slug) => ({ slug, name: humanizeSlug(slug), source: 'roadmap.sh' }));
}

export { isAiConfigured };
