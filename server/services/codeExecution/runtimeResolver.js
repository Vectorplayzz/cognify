/**
 * Runtime Resolver — maps a requested (language, version) onto a runtime
 * Piston actually has installed.
 *
 * The runtime list is fetched from Piston and cached, so a normal execution
 * costs one round trip rather than two.
 */
import { fetchRuntimes } from './pistonClient.js';

const CACHE_TTL_MS = Number(process.env.PISTON_RUNTIME_TTL_MS || 5 * 60 * 1000);

let cache = { runtimes: null, fetchedAt: 0 };

/** Runtimes, from cache when fresh. `force` bypasses the cache. */
export async function getRuntimes({ force = false } = {}) {
    const age = Date.now() - cache.fetchedAt;
    if (!force && cache.runtimes && age < CACHE_TTL_MS) {
        return cache.runtimes;
    }
    const runtimes = await fetchRuntimes();
    cache = { runtimes, fetchedAt: Date.now() };
    return runtimes;
}

/** Drop the cached runtime list (used after a Piston restart). */
export function invalidateRuntimeCache() {
    cache = { runtimes: null, fetchedAt: 0 };
}

function matchesLanguage(runtime, language) {
    const wanted = language.toLowerCase();
    if (runtime.language.toLowerCase() === wanted) return true;
    return (runtime.aliases || []).some((a) => a.toLowerCase() === wanted);
}

/**
 * Resolve a language (and optional version) to an installed runtime.
 * Returns the canonical runtime, or null when nothing matches.
 *
 * Version handling: an exact match wins; otherwise, when no version was
 * requested, the newest installed version of that language is used.
 */
export async function resolveRuntime(language, version, { force = false } = {}) {
    if (!language) return null;
    const runtimes = await getRuntimes({ force });
    const candidates = runtimes.filter((r) => matchesLanguage(r, language));
    if (candidates.length === 0) return null;

    if (version && version !== 'latest') {
        const exact = candidates.find((r) => r.version === version);
        if (exact) return exact;
        // Requested a version that is not installed — surface that distinctly
        // so the caller can explain it rather than silently running another one.
        return { ...candidates[0], _versionMismatch: true, _requestedVersion: version };
    }

    // Newest version by semver-ish descending sort.
    const sorted = [...candidates].sort((a, b) =>
        b.version.localeCompare(a.version, undefined, { numeric: true })
    );
    return sorted[0];
}

/** Language names + aliases Piston can currently run. */
export async function listSupportedLanguages() {
    const runtimes = await getRuntimes();
    return runtimes.map((r) => ({
        language: r.language,
        version: r.version,
        aliases: r.aliases || [],
    }));
}
