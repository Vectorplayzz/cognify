/**
 * Roadmap Source — all network access to roadmap.sh and its repository.
 *
 * Two upstream surfaces are used:
 *   1. https://roadmap.sh/<slug>.json  — the roadmap graph (nodes, edges,
 *      layout). This is what gives us ordering and hierarchy.
 *   2. raw.githubusercontent.com/.../roadmaps/<slug>/content/<topic>@<id>.md
 *      — the per-topic explanatory content.
 *
 * Node ids in the graph match the "@<id>" suffix of the content filenames,
 * which is what lets the two be joined.
 */

const ROADMAP_SITE = (process.env.ROADMAP_SH_URL || 'https://roadmap.sh').replace(/\/+$/, '');
const REPO = process.env.ROADMAP_REPO || 'nilbuild/developer-roadmap';
const BRANCH = process.env.ROADMAP_REPO_BRANCH || 'master';
const FETCH_TIMEOUT_MS = Number(process.env.ROADMAP_FETCH_TIMEOUT_MS || 20000);

export class RoadmapSourceError extends Error {
    constructor(message, { status } = {}) {
        super(message);
        this.name = 'RoadmapSourceError';
        this.status = status;
    }
}

async function get(url, { accept = 'application/json' } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: accept,
                // GitHub rejects requests without a User-Agent.
                'User-Agent': 'cognify-roadmap-sync',
                ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
            },
        });
        if (!res.ok) {
            throw new RoadmapSourceError(`GET ${url} returned HTTP ${res.status}`, { status: res.status });
        }
        return res;
    } catch (err) {
        if (err instanceof RoadmapSourceError) throw err;
        if (err.name === 'AbortError') {
            throw new RoadmapSourceError(`Timed out fetching ${url}`);
        }
        throw new RoadmapSourceError(`Cannot reach ${url}: ${err.message}`);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * The list of roadmap slugs, read from the upstream repository tree.
 * Built from the source rather than hard-coded (handout §41.4).
 */
export async function fetchCatalogSlugs() {
    const res = await get(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`);
    const data = await res.json();
    if (!Array.isArray(data.tree)) {
        throw new RoadmapSourceError('Upstream repository tree was not in the expected shape');
    }
    const slugs = new Set();
    for (const entry of data.tree) {
        // roadmaps/<slug>/content  ->  <slug>
        const m = /^roadmaps\/([^/]+)\/content$/.exec(entry.path);
        if (m) slugs.add(m[1]);
    }
    if (slugs.size === 0) {
        throw new RoadmapSourceError('No roadmaps found in the upstream repository tree');
    }
    return [...slugs].sort();
}

/** The roadmap graph for a slug: nodes, edges and layout. */
export async function fetchRoadmapGraph(slug) {
    const res = await get(`${ROADMAP_SITE}/${encodeURIComponent(slug)}.json`);
    const graph = await res.json();
    if (!graph || !Array.isArray(graph.nodes)) {
        throw new RoadmapSourceError(`Roadmap "${slug}" did not return a usable graph`);
    }
    return graph;
}

/** Filenames under roadmaps/<slug>/content, i.e. "<topic-slug>@<node-id>.md". */
export async function fetchContentIndex(slug) {
    const res = await get(
        `https://api.github.com/repos/${REPO}/contents/roadmaps/${encodeURIComponent(slug)}/content`
    );
    const files = await res.json();
    if (!Array.isArray(files)) return new Map();

    const byNodeId = new Map();
    for (const f of files) {
        if (f.type !== 'file' || !f.name.endsWith('.md')) continue;
        const base = f.name.slice(0, -3);
        const at = base.lastIndexOf('@');
        if (at === -1) continue;
        byNodeId.set(base.slice(at + 1), {
            topicSlug: base.slice(0, at),
            path: f.path,
            downloadUrl: f.download_url,
        });
    }
    return byNodeId;
}

/** Raw markdown for one content file. */
export async function fetchContentMarkdown(downloadUrl) {
    const res = await get(downloadUrl, { accept: 'text/plain' });
    return res.text();
}

export { REPO, BRANCH, ROADMAP_SITE };
