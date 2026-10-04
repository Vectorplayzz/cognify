/**
 * Vector DB Client — ChromaDB HTTP API
 * Provides simple add/query operations for RAG knowledge base
 */

const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL || 'http://127.0.0.1:8000';

export async function addToVectorDB(docs) {
  try {
    const res = await fetch(`${VECTOR_SERVICE_URL}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs),
    });
    return res.ok;
  } catch (e) {
    console.error('Vector DB add error:', e);
    return false;
  }
}

export async function queryVectorDB(queryEmbedding, topK = 5) {
  try {
    const res = await fetch(`${VECTOR_SERVICE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_embedding: queryEmbedding, top_k: topK }),
    });
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.error('Vector DB query error:', e);
    return [];
  }
}
