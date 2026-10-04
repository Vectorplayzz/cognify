// vector-service/index.js
// Pure Node.js vector DB service — no Python, no chromadb, no hnswlib
// Persists to JSON file; cosine-similarity search with HNSW-inspired flat index
// API-compatible with the frontend's vectorClient.js (POST /add, POST /query, GET /health)

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "chroma_db", "vectors.json");
const DB_DIR = path.join(__dirname, "chroma_db");

// ── Ensure dirs exist ──────────────────────────────────────────────
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { docs: [], version: 1 };
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return { docs: [], version: 1 };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function cosineSim(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Express app ────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ── Add / upsert documents ─────────────────────────────────────────
app.post("/add", (req, res) => {
  try {
    const docs = req.body;
    if (!Array.isArray(docs) || docs.length === 0) {
      return res.status(400).json({ error: "body must be a non-empty array" });
    }

    const db = loadDB();

    for (const doc of docs) {
      const { id, embedding, content, metadata = {} } = doc;
      if (!id || !embedding || !content) continue; // skip malformed

      const existing = db.docs.findIndex((d) => d.id === id);
      if (existing >= 0) {
        db.docs[existing] = { id, embedding, content, metadata };
      } else {
        db.docs.push({ id, embedding, content, metadata });
      }
    }

    saveDB(db);
    res.json({ status: "ok", added: docs.length });
  } catch (err) {
    console.error("[Vector] /add error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// ── Query top-k by cosine similarity ───────────────────────────────
app.post("/query", (req, res) => {
  try {
    const { query_embedding, top_k = 5 } = req.body;
    if (!query_embedding || !Array.isArray(query_embedding)) {
      return res.status(400).json({ error: "query_embedding required" });
    }

    const db = loadDB();
    if (db.docs.length === 0) {
      return res.json({ results: [] });
    }

    const scored = db.docs.map((doc) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata ?? {},
      distance: cosineSim(query_embedding, doc.embedding),
      // legacy field name used by the client's response parsing
      score: 1 - cosineSim(query_embedding, doc.embedding),
    }));

    scored.sort((a, b) => b.distance - a.distance);
    const top = scored.slice(0, top_k).map((s) => ({
      id: s.id,
      content: s.content,
      metadata: s.metadata,
      distance: s.distance,
      // Provide the score field the client uses: score = 1 - distance
      score: 1 - s.distance,
    }));

    // Return shape compatible with the frontend's result parsing
    res.json({
      results: top.map((r) => ({
        id: r.id,
        content: r.content,
        metadata: r.metadata,
        score: r.score,
        distance: r.distance,
      })),
    });
  } catch (err) {
    console.error("[Vector] /query error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// ── Health ─────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Start server ───────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 8000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Vector] Server running on http://0.0.0.0:${PORT}`);
});