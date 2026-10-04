/**
 * Roadmap Parser — turns a roadmap.sh graph into an ordered topic tree.
 *
 * roadmap.sh renders as a top-to-bottom flow chart, so `position.y` is the
 * curriculum order. Hierarchy comes from topic -> subtopic edges, with a
 * geometric fallback for subtopics that are drawn beside a topic but not
 * explicitly wired to it.
 */

const TOPIC = 'topic';
const SUBTOPIC = 'subtopic';

function label(node) {
    return (node?.data?.label || '').trim();
}

/** Sort by vertical position, then horizontal, to match reading order. */
function byPosition(a, b) {
    const ay = a.position?.y ?? 0;
    const by = b.position?.y ?? 0;
    if (ay !== by) return ay - by;
    return (a.position?.x ?? 0) - (b.position?.x ?? 0);
}

/**
 * Parse a roadmap.sh graph.
 * Returns { title, description, topics: [{ id, title, order, subtopics }] }.
 */
export function parseRoadmapGraph(graph, slug) {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];

    const topics = nodes.filter((n) => n.type === TOPIC && label(n)).sort(byPosition);
    const subtopics = nodes.filter((n) => n.type === SUBTOPIC && label(n));

    if (topics.length === 0) {
        throw new Error(`Roadmap "${slug}" contains no topic nodes`);
    }

    const topicIds = new Set(topics.map((t) => t.id));

    // Explicit parentage from topic -> subtopic edges.
    const parentOf = new Map();
    for (const edge of edges) {
        if (topicIds.has(edge.source) && !topicIds.has(edge.target)) {
            if (!parentOf.has(edge.target)) parentOf.set(edge.target, edge.source);
        } else if (topicIds.has(edge.target) && !topicIds.has(edge.source)) {
            if (!parentOf.has(edge.source)) parentOf.set(edge.source, edge.target);
        }
    }

    // Subtopics with no edge attach to the nearest topic at or above them.
    const assignByPosition = (node) => {
        const y = node.position?.y ?? 0;
        let best = null;
        let bestDelta = Infinity;
        for (const t of topics) {
            const delta = y - (t.position?.y ?? 0);
            // Slight negative tolerance: a subtopic may sit a little higher
            // than the topic it belongs to.
            if (delta >= -60 && delta < bestDelta) {
                bestDelta = delta;
                best = t;
            }
        }
        return best ? best.id : topics[0].id;
    };

    const childrenOf = new Map(topics.map((t) => [t.id, []]));
    for (const sub of subtopics) {
        const parent = parentOf.get(sub.id) ?? assignByPosition(sub);
        if (!childrenOf.has(parent)) childrenOf.set(parent, []);
        childrenOf.get(parent).push(sub);
    }

    const parsedTopics = topics.map((topic, i) => ({
        id: topic.id,
        title: label(topic),
        order: i + 1,
        subtopics: (childrenOf.get(topic.id) || []).sort(byPosition).map((s) => ({
            id: s.id,
            title: label(s),
        })),
    }));

    const title =
        (typeof graph.title === 'string' && graph.title) ||
        graph.title?.page ||
        graph.title?.card ||
        null;

    return {
        title,
        description: typeof graph.description === 'string' ? graph.description : '',
        topics: parsedTopics,
    };
}

/**
 * Strip a content file down to usable prose.
 * The files start with "# Title" and end with a "Visit the following
 * resources" link list, which is noise inside Cognify.
 */
export function extractContent(markdown) {
    if (!markdown) return { heading: '', body: '' };

    const lines = markdown.split('\n');
    let heading = '';
    let start = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.startsWith('# ')) {
            heading = line.slice(2).trim();
            start = i + 1;
        }
        break;
    }

    const body = [];
    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        // Everything from the resources list onward is links.
        if (/^#+\s/.test(line) && /visit the following resources|learn more from/i.test(line)) break;
        if (/^visit the following resources/i.test(line.trim())) break;
        body.push(line);
    }

    // Drop trailing bare link bullets.
    while (body.length && /^\s*-\s*\[/.test(body[body.length - 1])) body.pop();

    return { heading, body: body.join('\n').trim() };
}
