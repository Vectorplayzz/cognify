/**
 * MySQL-backed Vector Store for RAG (replaces the file-based / ChromaDB service)
 * ---------------------------------------------------------------------------
 * Chunk embeddings are stored in the `note_embeddings` table and searched with
 * brute-force cosine similarity in Node. This keeps the whole RAG pipeline in a
 * single datastore (your existing MySQL), so it survives any hosting move and
 * needs no separate long-running vector process.
 *
 * API-compatible with the old vectorClient.js: exports addToVectorDB / queryVectorDB.
 *
 * Scaling note: brute-force cosine is ideal up to ~tens of thousands of chunks.
 * Beyond that, switch to an ANN index (MySQL 9 / MariaDB 11.8 VECTOR, or an
 * external vector DB). Candidate scan is capped by VECTOR_MAX_CANDIDATES.
 */

import pool from './db.js';

const MAX_CANDIDATES = parseInt(process.env.VECTOR_MAX_CANDIDATES, 10) || 4000;

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Upsert chunk documents into the vector store.
 * @param {Array<{id:string, embedding:number[], content:string, metadata?:object}>} docs
 * @returns {Promise<boolean>}
 */
export async function addToVectorDB(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return false;

  const rows = docs
    .filter((d) => d && d.id && Array.isArray(d.embedding) && d.embedding.length > 0 && d.content)
    .map((d) => {
      const meta = d.metadata || {};
      return [
        String(d.id),
        meta.sourceId ?? null,
        meta.noteId ?? null,
        meta.userId ?? null,
        d.content,
        JSON.stringify(d.embedding),
        meta.model || meta.embedModel || '',
        d.embedding.length,
        JSON.stringify(meta),
      ];
    });

  if (rows.length === 0) return false;

  try {
    await pool.query(
      `INSERT INTO note_embeddings
        (doc_id, source_id, note_id, user_id, content, embedding, embed_model, dim, metadata)
       VALUES ?
       ON DUPLICATE KEY UPDATE
        content    = VALUES(content),
        embedding  = VALUES(embedding),
        embed_model= VALUES(embed_model),
        dim        = VALUES(dim),
        metadata   = VALUES(metadata)`,
      [rows]
    );
    return true;
  } catch (e) {
    console.error('[VectorStore] add error:', e.message);
    return false;
  }
}

/**
 * Query top-k most similar chunks by cosine similarity.
 * @param {number[]} queryEmbedding
 * @param {number} topK
 * @param {{ model?:string, maxCandidates?:number }} [opts]
 * @returns {Promise<Array<{id:string, content:string, metadata:object, score:number}>>}
 */
export async function queryVectorDB(queryEmbedding, topK = 5, opts = {}) {
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];

  // Only compare vectors of the same dimension (and model, when provided) so we
  // never mix embeddings produced by different models.
  const where = ['dim = ?'];
  const params = [queryEmbedding.length];
  if (opts.model) {
    where.push('embed_model = ?');
    params.push(opts.model);
  }
  if (opts.userId != null) {
    where.push('user_id = ?');
    params.push(opts.userId);
  }
  const limit = opts.maxCandidates || MAX_CANDIDATES;

  try {
    const [candidates] = await pool.query(
      `SELECT doc_id, content, embedding, metadata
         FROM note_embeddings
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ?`,
      [...params, limit]
    );

    const scored = [];
    for (const row of candidates) {
      let emb;
      try {
        emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      } catch {
        continue;
      }
      let meta = row.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
      }
      scored.push({
        id: row.doc_id,
        content: row.content,
        metadata: meta || {},
        score: cosineSim(queryEmbedding, emb),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  } catch (e) {
    console.error('[VectorStore] query error:', e.message);
    return [];
  }
}

/**
 * Remove all embeddings for a given source (FK cascade also handles this on
 * source/note delete; exposed for explicit cleanup).
 */
export async function deleteSourceVectors(sourceId) {
  try {
    await pool.query('DELETE FROM note_embeddings WHERE source_id = ?', [sourceId]);
    return true;
  } catch (e) {
    console.error('[VectorStore] delete error:', e.message);
    return false;
  }
}
