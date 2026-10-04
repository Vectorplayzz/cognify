/**
 * Roadmap Catalog — which roadmap.sh roadmaps exist, and how user input
 * maps onto them.
 *
 * The slug list is built from the upstream repository rather than hand-typed,
 * so new roadmaps appear automatically on the next sync.
 */

// Words that carry no disambiguating meaning in a learning-goal phrase.
const FILLER = new Set([
    'roadmap', 'roadmaps', 'path', 'learning', 'learn', 'course', 'tutorial',
    'developer', 'develop', 'development', 'engineer', 'engineering',
    'programming', 'programmer', 'guide', 'basics', 'fundamentals', 'for',
    'a', 'an', 'the', 'to', 'in', 'of', 'and', 'become', 'becoming', 'how',
    'study', 'career', 'track',
]);

/**
 * Hand-maintained aliases for phrasings that normalization alone cannot
 * resolve. Keys are already normalized (see normalizeTopic).
 */
const MANUAL_ALIASES = {
    'front end': 'frontend',
    'back end': 'backend',
    'full stack': 'full-stack',
    'fullstack': 'full-stack',
    'web': 'frontend',
    'web frontend': 'frontend',
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'golang': 'golang',
    'go': 'golang',
    'c++': 'cpp',
    'cplusplus': 'cpp',
    'c plus plus': 'cpp',
    'c#': 'aspnet-core',
    'c sharp': 'aspnet-core',
    'csharp': 'aspnet-core',
    'dotnet': 'aspnet-core',
    'net': 'aspnet-core',
    'asp net': 'aspnet-core',
    'asp net core': 'aspnet-core',
    'spring': 'spring-boot',
    'swift': 'swift-ui',
    'swiftui': 'swift-ui',
    'ml': 'machine-learning',
    'ai': 'ai-engineer',
    'artificial intelligence': 'ai-engineer',
    'data science': 'ai-data-scientist',
    'data scientist': 'ai-data-scientist',
    'devops': 'devops',
    'sre': 'devops',
    'cyber security': 'cyber-security',
    'cybersecurity': 'cyber-security',
    'security': 'cyber-security',
    'qa': 'qa',
    'testing': 'qa',
    'ios': 'ios',
    'android': 'android',
    'react native': 'react-native',
    'sql': 'sql',
    'postgres': 'postgresql-dba',
    'postgresql': 'postgresql-dba',
    'mongo': 'mongodb',
    'k8s': 'kubernetes',
    'kubernetes': 'kubernetes',
    'docker': 'docker',
    'aws': 'aws',
    'system design': 'system-design',
    'design system': 'design-system',
    'blockchain': 'blockchain',
    'game dev': 'game-developer',
    'game development': 'game-developer',
    'ux': 'ux-design',
    'ui ux': 'ux-design',
    'product manager': 'product-manager',
    'prompt engineering': 'prompt-engineering',
    'technical writing': 'technical-writer',
};

/** lowercase, strip punctuation, collapse whitespace. */
export function normalizeTopic(input) {
    return String(input || '')
        .toLowerCase()
        .replace(/[_/]+/g, ' ')
        .replace(/[^a-z0-9+#\- ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** The normalized phrase with filler words removed (order preserved). */
function contentTokens(normalized) {
    return normalized.split(' ').filter((t) => t && !FILLER.has(t));
}

function tokenKey(normalized) {
    return contentTokens(normalized).join(' ');
}

/** "ai-data-scientist" -> "Ai Data Scientist" */
export function humanizeSlug(slug) {
    return slug
        .split('-')
        .map((p) => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
        .join(' ');
}

/**
 * Resolve a user-entered topic to a roadmap.sh slug.
 *
 * Deliberately conservative: exact slug, curated alias, or an exact match on
 * the meaningful tokens. Anything less certain returns null so the caller
 * falls back to AI generation rather than showing the wrong curriculum.
 *
 * Returns { slug, confidence, matchedBy } or null.
 */
export function resolveSlug(topic, slugs) {
    const normalized = normalizeTopic(topic);
    if (!normalized) return null;

    const slugSet = new Set(slugs);
    const dashed = normalized.replace(/ /g, '-');

    // 1. Exact slug, e.g. "frontend" or "ai-engineer".
    if (slugSet.has(dashed)) {
        return { slug: dashed, confidence: 1, matchedBy: 'slug' };
    }

    // 2. Curated alias.
    const alias = MANUAL_ALIASES[normalized];
    if (alias && slugSet.has(alias)) {
        return { slug: alias, confidence: 0.95, matchedBy: 'alias' };
    }

    // 3. Meaningful-token match: "frontend developer" -> "frontend",
    //    "become a devops engineer" -> "devops".
    const key = tokenKey(normalized);
    if (key) {
        const keyDashed = key.replace(/ /g, '-');
        if (slugSet.has(keyDashed)) {
            return { slug: keyDashed, confidence: 0.9, matchedBy: 'tokens' };
        }
        const aliasFromKey = MANUAL_ALIASES[key];
        if (aliasFromKey && slugSet.has(aliasFromKey)) {
            return { slug: aliasFromKey, confidence: 0.9, matchedBy: 'alias-tokens' };
        }
        // Compare against each slug's own meaningful tokens so that
        // "postgresql dba" matches "postgresql-dba" regardless of order.
        const wanted = [...contentTokens(normalized)].sort().join(' ');
        for (const slug of slugSet) {
            const slugKey = [...contentTokens(slug.replace(/-/g, ' '))].sort().join(' ');
            if (slugKey && slugKey === wanted) {
                return { slug, confidence: 0.85, matchedBy: 'token-set' };
            }
        }
    }

    // 4. JavaScript-ecosystem spellings: "react.js", "reactjs", "Node JS",
    //    "next.js developer". Normalization turns "react.js" into "react js",
    //    and roadmap.sh names these inconsistently ("react", "vue" but
    //    "nodejs", "nextjs"), so try both the bare and the joined form.
    const tokens = contentTokens(normalized);
    let base = null;
    if (tokens.length === 2 && tokens[1] === 'js') base = tokens[0];
    else if (tokens.length === 1 && tokens[0].length > 4 && tokens[0].endsWith('js')) base = tokens[0].slice(0, -2);
    if (base) {
        for (const candidate of [base, `${base}js`]) {
            if (slugSet.has(candidate)) {
                return { slug: candidate, confidence: 0.9, matchedBy: 'js-suffix' };
            }
        }
    }

    // Anything else is treated as unsupported — no fuzzy guessing.
    return null;
}

export { MANUAL_ALIASES, FILLER };
