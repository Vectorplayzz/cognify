> **Out of date — kept for history.** The standalone vector service
> (`vector-service/`, port 8000) described below is retired. Embeddings are
> stored in the MySQL `note_embeddings` table and searched by
> `server/vectorStore.js`, scoped to the signed-in user. See the README.

# RAG Notes System — Setup Guide

## Overview

The RAG (Retrieval-Augmented Generation) Notes system allows users to upload documents (PDF, TXT, MD) which are automatically:
1. Extracted (text content)
2. Chunked into overlapping segments
3. Embedded using local Ollama model (no API key needed)
4. Indexed into a shared ChromaDB vector database

When generating notes, the system retrieves relevant snippets from ALL uploaded knowledge and injects them into the LLM prompt for richer, context-aware generation.

---

## Architecture

```
┌─────────────┐     Upload      ┌──────────────┐     Extract    ┌────────────┐
│   Client    │ ─────────────►  │   Backend    │ ────────────► │  Text      │
│ (React)     │   multipart     │ (Node/Express)│   pdf-parse   │  Chunks    │
└─────────────┘                 └──────────────┘               └────────────┘
                                                                    │
                                                                    ▼
┌─────────────┐     Retrieve    ┌──────────────┐     Embed    ┌────────────┐
│   ChromaDB  │ ◄────────────── │   Backend    │ ◄─────────── │  Ollama    │
│ (Shared     │   top-k hits    │ (Node)       │   nomic-     │  (Local)   │
│  Persistent)│                 │              │   embed-text)│
└─────────────┘                 └──────────────┘               └────────────┘
                                                                    │
                                                                    ▼
┌─────────────┐     Generate    ┌──────────────┐     Stream   ┌────────────┐
│   Notes     │ ◄────────────── │   LLM API    │ ◄─────────── │  Prompt    │
│ (MySQL)     │  RAG-augmented │ (OpenRouter  │   tokens     │  w/Context │
│             │  synthesis     │  / Ollama)   │              │            │
└─────────────┘                 └──────────────┘              └────────────┘
```

---

## Prerequisites

### 1. Install Python 3.10+
Required for the ChromaDB vector service.

```bash
python --version  # Should be 3.10+
```

### 2. Install Ollama (Local LLM & Embeddings)
Download from https://ollama.ai and install.

Start Ollama service:
```bash
ollama serve  # Runs on http://localhost:11434
```

In a separate terminal, pull the embedding model:
```bash
ollama pull nomic-embed-text
```

You can also use `all-minilm` if preferred (smaller, faster):
```bash
ollama pull all-minilm
```

### 3. Get Google GenAI API Key (Optional — for embeddings alternative)
If you prefer cloud embeddings over local Ollama, you can use Google's `text-embedding-004` model. Get a key from https://makersuite.google.com/app/apikey and set `GOOGLE_API_KEY` in `.env.local`.

However, the default configuration uses **local Ollama** — no API key required.

---

## Setup Steps

### Step 1: Install Node Dependencies

```bash
npm install
```

This installs: `multer`, `pdf-parse`, `uuid`, and other existing dependencies.

### Step 2: Configure Environment Variables

Create or edit `.env.local` in the project root:

```env
# Database (already configured)
DB_HOST=mysql.us.stackcp.com
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=your_db
DB_PORT=43056

# API Server
API_PORT=3001

# Local Embedding (Ollama) — No API key needed
# Ollama runs on localhost:11434 by default
OLLAMA_EMBED_BASE=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text   # or 'all-minilm'

# Optional: Google embeddings (if you want cloud fallback)
# GOOGLE_API_KEY=your_key_here

# Vector DB service (ChromaDB Python — runs on port 8000)
VECTOR_SERVICE_URL=http://localhost:8000
```

### Step 3: Start ChromaDB Vector Service

In a new terminal window:

```bash
# Option A: Using npm script
npm run vector

# Option B: Directly
cd vector-service
pip install -r requirements.txt
python main.py
```

You should see:
```
INFO:     Started server process [xxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

Keep this terminal open.

### Step 4: Start the Main App

In another terminal:

```bash
npm run dev
```

This starts both the frontend (Vite on 3000) and backend (Express on 3001).

---

## How It Works

### Uploading Sources

1. Go to the Notes tab in the UI
2. In the sidebar, use **"Upload Sources (PDF, TXT, MD)"** file picker
3. Select one or more files
4. Files are uploaded to `/api/notes/upload-files` → text extracted → each file is added as a source
5. **Background**: Each source is automatically chunked (1000 char chunks with 200 overlap), embedded via Ollama, and indexed into ChromaDB with metadata (`fileName`, `sourceId`, `noteId`)

### Generating Notes with RAG

1. After uploading sources, they appear in the **Sources** list
2. Click a source to view its content (optional)
3. Select a **Note Type** (Summary, Study Guide, Exam Prep, Flashcards)
4. Click **Generate Notes**
5. Behind the scenes:
   - The system generates a query from source titles + note type
   - Queries ChromaDB for top-5 relevant chunks
   - Appends those chunks as **"📚 Shared Knowledge Base"** to the prompt
   - LLM (OpenRouter or local Ollama) synthesizes ALL sources, including retrieved shared knowledge
   - Output streams in real-time

### Shared Knowledge Base

All uploaded sources are indexed into a **global ChromaDB** collection accessible to all users. When any user generates notes:
- Their own sources are used first
- Then relevant snippets from other users' uploaded documents are retrieved (if they match the query)
- This creates a collaborative, growing knowledge base

---

## File Structure

```
project/
├── vector-service/           # Python ChromaDB service
│   ├── main.py               # FastAPI server (port 8000)
│   └── requirements.txt      # fastapi, uvicorn, chromadb
├── server/
│   ├── routes/
│   │   └── notes.js          # Notes API + upload + RAG retrieval
│   ├── services/
│   │   ├── embeddingService.js    # Ollama embeddings (local)
│   │   └── vectorClient.js        # ChromaDB HTTP client
│   └── index.js              # Main Express server (port 3001)
├── services/
│   ├── notesService.ts       # Frontend notesService with RAG integration
│   └── codeExecutionService.ts  # Client-side only execution
├── components/
│   └── NotesView.tsx         # UI with file upload
├── .env.example              # Environment template
├── .env.local                # Your local config
└── package.json              # Scripts: "vector", "dev", "dev:all"
```

---

## API Reference

### New Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/notes/upload-files` | Upload PDF/TXT/MD files, extract text, return JSON array |
| `POST /api/notes/retrieve` | RAG retrieval - accepts `{ query, topK }`, returns relevant chunks |
| `POST /api/notes/sources` | Create a note source (auto-indexes into ChromaDB) |
| `GET /health` | Health check for each service |

### Without RAG? (Disable retrieval)

In `NotesView.tsx` → `generateNotes()` call, you can set `useRAG: false` to skip retrieval (uses only user's own sources).

---

## Troubleshooting

### ChromaDB Service Won't Start

**Error**: `ModuleNotFoundError: No module named 'chromadb'`

**Fix**:
```bash
cd vector-service
pip install -r requirements.txt
```

### Embeddings Fail (Ollama not running)

**Error**: `Fetch failed` or `Connection refused` on embedding calls

**Fix**: Start Ollama:
```bash
ollama serve
ollama pull nomic-embed-text
```

### No Retrieval Results

If RAG returns empty results, possible causes:
- ChromaDB collection empty (no sources uploaded/indexed yet)
- Embedding model mismatch (check `OLLAMA_EMBED_MODEL` matches installed model)
- Ollama not running or model not pulled

Check logs in terminal running `npm run vector` and the backend terminal for errors.

### Port Conflicts

Default ports:
- Frontend: 3000
- Backend: 3001
- ChromaDB: 8000
- Ollama: 11434

Change in `.env.local` if needed.

---

## Security Notes

- **File uploads**: Limited to 10MB each, max 5 files per request
- **Text extraction**: Server-side using `pdf-parse` — never executes uploaded content
- **Embeddings**: Generated locally via Ollama — no data leaves your machine
- **Vector DB**: ChromaDB runs locally in `vector-service/chroma_db/` (persistent)
- **HTML/JS preview**: Already sandboxed via iframe (`allow-scripts` only)

---

## Performance Tips

- **Chunk size**: Currently 1000 chars with 200 overlap. Adjust in `embeddingService.chunkText()` if needed
- **Top-K retrieval**: Currently 5 chunks; change in `notesService.ts` `topK: 5`
- **Ollama model**: `nomic-embed-text` (768-dim) is fast (~100ms/chunk). `all-minilm` is even faster but lower quality.
- **Batch embeddings**: Currently one-by-one; can be optimized to batch calls for large uploads

---

## Future Improvements

- [ ] Add PDF page range limits
- [ ] Support DOCX via mammoth.js
- [ ] Add vector DB admin UI (view collections, delete documents)
- [ ] Re-ranking of retrieved chunks (cohere rerank or local model)
- [ ] Per-user private collections (currently shared global)
- [ ] Automatic source title extraction from filename

---

That concludes the complete implementation. The system is ready to use — just install dependencies, start the vector service, and run your app.
