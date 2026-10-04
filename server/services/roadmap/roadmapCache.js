/**
 * Roadmap Cache — on-disk snapshots of normalized roadmaps.
 *
 * Writes are atomic (temp file + rename), so a failed or partial sync can
 * never replace a good snapshot with a broken one (handout §12).
 */
import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = process.env.ROADMAP_CACHE_DIR
    || path.join(process.cwd(), 'server', 'data', 'roadmap-cache');

const TTL_MS = Number(process.env.ROADMAP_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000); // 7 days

async function ensureDir() {
    await fs.mkdir(CACHE_DIR, { recursive: true });
}

function fileFor(key) {
    const safe = String(key).replace(/[^a-z0-9._-]/gi, '_');
    return path.join(CACHE_DIR, `${safe}.json`);
}

/** Read a cached entry. Returns { data, cachedAt, stale } or null. */
export async function read(key) {
    try {
        const raw = await fs.readFile(fileFor(key), 'utf-8');
        const entry = JSON.parse(raw);
        if (!entry || typeof entry.cachedAt !== 'number') return null;
        return {
            data: entry.data,
            cachedAt: entry.cachedAt,
            stale: Date.now() - entry.cachedAt > TTL_MS,
        };
    } catch {
        return null; // missing or unreadable is simply a miss
    }
}

/** Write atomically: a crash mid-write leaves the previous snapshot intact. */
export async function write(key, data) {
    await ensureDir();
    const target = fileFor(key);
    const tmp = `${target}.${process.pid}.tmp`;
    const payload = JSON.stringify({ cachedAt: Date.now(), data });
    await fs.writeFile(tmp, payload, 'utf-8');
    await fs.rename(tmp, target);
}

export { CACHE_DIR, TTL_MS };
