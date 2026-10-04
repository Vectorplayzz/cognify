/**
 * Local Embedding Service — Ollama (No API Key Required)
 * Uses locally-running Ollama with nomic-embed-text or all-minilm.
 *
 * NOTE: Ollama's /api/embed endpoint returns { embeddings: [[...]] } (batched),
 * while the legacy /api/embeddings returns { embedding: [...] }. We handle both.
 */

const OLLAMA_BASE = process.env.OLLAMA_EMBED_BASE || 'http://localhost:11434';
export const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

/**
 * Generate an embedding for a single text via Ollama local embeddings.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const input = (text ?? '').toString();
  if (!input.trim()) throw new Error('embedText: empty input');

  const response = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama embed error ${response.status}: ${body}`);
  }

  const data = await response.json();

  // /api/embed returns { embeddings: [[...]] }; legacy /api/embeddings returns { embedding: [...] }
  const vec = Array.isArray(data && data.embeddings)
    ? data.embeddings[0]
    : Array.isArray(data && data.embedding)
      ? data.embedding
      : null;

  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Invalid embedding response from Ollama');
  }
  return vec;
}

/**
 * Generate embeddings for multiple texts.
 * Uses Ollama's batch input when possible, falling back to per-item calls.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts) {
  const items = (texts || []).map((t) => (t ?? '').toString()).filter((t) => t.trim());
  if (items.length === 0) return [];

  try {
    const response = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: items }),
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data && data.embeddings) && data.embeddings.length === items.length) {
        return data.embeddings;
      }
    }
  } catch (_) {
    // fall through to per-item path
  }

  // Fallback: embed one at a time (also covers legacy Ollama versions)
  return Promise.all(items.map((t) => embedText(t)));
}

/**
 * Split text into overlapping chunks for better retrieval.
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {string[]}
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  const clean = (text ?? '').toString();
  if (clean.length <= chunkSize) return clean.trim() ? [clean] : [];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks;
}
