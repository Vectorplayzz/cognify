🚀 Cognify
📌 Overview

Cognify is an AI-powered e-learning platform designed to provide personalized, structured, and interactive learning experiences for students. It combines intelligent roadmaps, adaptive quizzes, real-time coding environments, and RAG-based note synthesis to help learners master both academic and industry-relevant skills efficiently.

The platform bridges the gap between traditional education and modern industry requirements by offering guided learning paths, AI assistance, hands-on practice, and shared knowledge bases.

✨ Features
🔹 Core Features
🤖 AI-Powered Learning with personalized recommendations
📚 Structured Roadmaps — sourced from roadmap.sh (94 roadmaps), with AI generation as fallback
🧩 Quiz-Based Progression System (unlock next modules only after completion)
💻 Interactive Code Playground — sandboxed server-side execution via self-hosted Piston
📊 Student Ranking Dashboard based on performance
👨‍🏫 Faculty Dashboard for course creation and analytics
📝 RAG Notes — PDF Upload, Shared Knowledge Base, AI Synthesis
🎥 Video Lectures with offline access support
🌐 **Web-Enhanced Chatbot** — optional Exa web search, proxied through the backend

🔹 Advanced Features
✨ AI Smart Notes & Lecture Summarization (RAG-enabled)
🌐 Multi-Language Support (English, Hindi, Telugu)
🏆 Gamification (Leaderboards, challenges, achievements)
📈 Progress Tracking with analytics
🧩 Real-time Feedback & Performance Insights
🧑‍💻 Blogging Platform for students & faculty

🛠️ Tech Stack
Frontend:
React (Vite) + TypeScript
Tailwind CSS

Backend:
Node.js + Express.js

Database:
MySQL (hosted)

AI & Embeddings:
Any OpenAI-compatible LLM endpoint (default: local Ollama at :11434/v1)
Ollama (embeddings via nomic-embed-text)
SearXNG (self-hosted web search — no API key)

Vector Database:
MySQL table `note_embeddings`, queried by server/vectorStore.js (cosine similarity).
The old standalone vector-service/ is retired and no longer run.

Code Execution:
Self-hosted Piston (Docker) — Python, JavaScript, Java, Go, Rust, C, C++
HTML/CSS/JS render client-side in an iframe preview
All execution goes through the backend at POST /api/execute (validated, rate limited)

⚙️ Installation & Setup

1. Install Node dependencies
   npm install

2. Install and start Ollama (for embeddings, optional local LLM)
   Download from https://ollama.ai
   ollama pull nomic-embed-text

3. Configure environment variables
   Copy .env.example to .env and set:
   - SESSION_SECRET — signs session tokens (openssl rand -base64 48). Required.
   - GOOGLE_CLIENT_ID — must match the clientId in index.tsx. Required.
   - DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME — MySQL. Never hardcode these.
   - LLM_API_KEY — provider key for chat/notes/quizzes and the roadmap AI fallback
   - LLM_BASE_URL / LLM_MODELS — provider endpoint and permitted model list
   - SEARCH_PROVIDER=searxng — self-hosted search (no key). Use "exa" + EXA_API_KEY for hosted Exa.
   - PISTON_URL=http://localhost:2000 — self-hosted code execution
   - CORS_ORIGINS — allowed browser origins in production
   - LLM_FALLBACK_BASE_URL — endpoint tried when LLM_BASE_URL is down
   - OLLAMA_EMBED_BASE=http://localhost:11434 (default)
   - OLLAMA_EMBED_MODEL=nomic-embed-text (default)

   API keys are read by the backend only and are never bundled into the
   frontend. Do not prefix a secret with VITE_ — that exposes it to the browser.

4. Start Piston (code execution) and SearXNG (web search)
   cd deploy/piston && docker compose up -d
   cd deploy/searxng && docker compose up -d
   Verify: curl http://localhost:2000/api/v2/runtimes

5. Start the development server
   npm run dev

   This starts:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

📚 RAG Notes System

Upload documents (PDF, TXT, MD) in the Notes tab. They are automatically:
1. Extracted on the server
2. Chunked into segments
3. Embedded using Ollama local model
4. Indexed into a shared ChromaDB

When you generate notes (Summary, Study Guide, Exam Prep, Flashcards), the system retrieves relevant snippets from the shared knowledge base and augments the LLM prompt for richer, context-aware output.

🌐 Web-Enhanced Chatbot

The chatbot now uses **Exa search** (https://exa.ai) to provide accurate, up-to-date information:
- Automatically searches the web for factual/current information queries
- Augments AI responses with retrieved web content
- Shows "Searching web..." indicator when fetching information
- Configure via `VITE_EXA_API_KEY` in `.env.local`

🗺️ Roadmap Generation with roadmap.sh Reference

Roadmap generation now references **roadmap.sh** (https://roadmap.sh) for accurate, industry-standard learning paths:
- Fetches relevant roadmaps from roadmap.sh API as reference
- Falls back to Exa search for roadmap.sh content if API unavailable
- Ensures roadmaps align with industry standards and avoid hallucinations

🔐 Code Playground Security

All code execution is **client-side only**:
- JavaScript/TypeScript: Runs in your browser via Function constructor
- Python: Runs in browser via Pyodide WebAssembly
- HTML/CSS/JS: Rendered in a sandboxed iframe
- C/C++/Java/PHP/etc: Not supported (no server-side execution)

No server-side code execution required — safe for hosting.



## 📚 Roadmap Sources

Roadmaps resolve server-side through `GET /api/roadmaps/resolve?topic=...`:

1. **roadmap.sh first.** The topic is normalized and matched against the
   upstream catalog (94 roadmaps). On a match, the roadmap graph
   (`https://roadmap.sh/<slug>.json`) supplies ordering and hierarchy, and the
   upstream repository supplies each topic's content. Snapshots are cached on
   disk and refreshed weekly.
2. **AI fallback.** Unmatched topics fall back to AI generation, whose output
   is schema-validated before it is returned or stored.
3. **Controlled failure.** If both are unavailable the API returns a clear
   error rather than an empty roadmap.

Matching is deliberately conservative — no uncontrolled fuzzy matching. A
low-confidence topic is treated as unsupported and routed to the AI fallback.

Useful endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/roadmaps/resolve?topic=` | Resolve a topic to a roadmap |
| `GET /api/roadmaps/catalog` | List available roadmap.sh roadmaps |
| `POST /api/execute` | Run code (validated, rate limited) |
| `GET /api/execute/languages` | Installed runtimes |
| `GET /api/health/piston` | Execution service health |
| `POST /api/llm/chat` | LLM proxy (keeps the key server-side) |
| `POST /api/search/web` | Web search proxy |

## 🔎 Web Search (SearXNG)

The chatbot's web search runs against a self-hosted SearXNG instance — no API
key, no usage cost, and queries are not sent to a third-party search vendor.

```bash
docker run -d --name searxng --restart unless-stopped \
  -p 127.0.0.1:8888:8080 \
  -v /var/www/cognify/searxng:/etc/searxng:rw \
  searxng/searxng:latest
```

Config lives in `searxng/settings.yml`. The JSON API is enabled there (off by
default upstream) because the backend needs it. SearXNG is bound to
`127.0.0.1` — only Cognify's API talks to it.

Check it with `GET /api/search/status`. To switch back to hosted Exa, set
`SEARCH_PROVIDER=exa` and `EXA_API_KEY`.

## 🔐 Service Exposure

Internal services are bound to loopback and reached only through the backend:

| Service | Bind | Reached via |
| --- | --- | --- |
| Piston (code execution) | `127.0.0.1:2000` | `POST /api/execute` |
| SearXNG (web search) | `127.0.0.1:8888` | `POST /api/search/web` |
| OmniRoute (LLM gateway) | `127.0.0.1:20128` | `POST /api/llm/chat` |
| Ollama (LLM + embeddings) | `127.0.0.1:11434` | `POST /api/llm/chat` (fallback) |

None of these should be published on a public interface. Piston in particular
executes arbitrary code — binding it to `0.0.0.0` exposes unauthenticated
remote code execution.

nginx proxies only `/api/`. The old `/llm-api/`, `/ollama-stream/` and
`/vector-api/` locations were removed: they exposed Ollama and the vector
service to the internet without authentication.

## 🔑 Authentication & Access Control

Sign-in uses Google, but the browser's word is never trusted:

1. The browser signs in with Google and sends the access token to
   `POST /api/auth/google`.
2. The server checks it with Google — the token must be live and issued to
   `GOOGLE_CLIENT_ID`, so a token minted for another app is rejected.
3. The server upserts the user and returns a Cognify session token
   (HMAC-SHA256, 7 days). The browser sends it as `Authorization: Bearer`.

Every API route requires that token except sign-in and a few read-only
status endpoints (`PUBLIC_ROUTES` in `server/routes/api.js`). The user is
taken from the token (`req.user`); user ids in the body, query or path are
ignored or must match it. Resources are checked for ownership — roadmaps,
progress, chats, notes and sources by owner; rooms by membership; level
content and quizzes through their roadmap. Another user's resource reads as
404 rather than 403, so ids cannot be probed.

RAG retrieval searches only the caller's own documents. Set
`RAG_SHARED_KNOWLEDGE=true` only if every user's uploads should be searchable
by everyone.

Rate limits apply per signed-in user, not per IP, so a classroom behind one
school network is not throttled as a single client. Rotating `SESSION_SECRET`
signs everyone out.

## 🚀 Deployment

Everything that runs outside the Node process is versioned in `deploy/`:

| Path | Installed at |
| --- | --- |
| `deploy/nginx/cognify.ourspaces.net.conf` | `/etc/nginx/sites-available/` |
| `deploy/nginx/cognify-security-headers.conf` | `/etc/nginx/snippets/` |
| `deploy/piston/docker-compose.yaml` | `/root/piston/` — sandbox memory, CPU and concurrency limits |
| `deploy/searxng/docker-compose.yaml` | run from `deploy/searxng/` |
| `deploy/cron/clean-package-caches.sh` | `/etc/cron.monthly/clean-package-caches` |
| `deploy/cron/backup-db.sh` | `/etc/cron.daily/cognify-db-backup` — dumps to `/root/cognify-backups`, keeps 14 |

Restore a backup: `zcat /root/cognify-backups/<file>.sql.gz | mysql -h … -u … -p <db>`.

Deploy a change:

```bash
npm test && npm run build:prod
pm2 restart cognify-api --update-env
npm run test:integration
```

`nginx -t` before any `systemctl reload nginx` — this nginx serves other
sites too. The cache cron removes only npm/pip/uv caches; it never touches
logs.

## 🧪 Testing

```bash
npm test                  # unit: no network, no database
npm run test:integration  # against the running API (COGNIFY_API_URL to override)
```

Unit tests cover topic resolution, roadmap.sh parsing, the roadmap.sh-down
and AI-failure paths, AI output validation, execution validation and
formatting, sessions and the auth middleware, and LLM model/endpoint
fallback. Integration tests cover sign-in rejection, 401s on every protected
route, cross-user access, all seven playground languages, timeouts and the
memory limit. They sign in with a session minted from `SESSION_SECRET` for a
synthetic user who owns nothing.

## 🔀 LLM Gateway (OmniRoute)

LLM traffic goes through a self-hosted [OmniRoute](https://www.omniroute.online/)
gateway, which presents one OpenAI-compatible endpoint and falls back across
providers. Cognify only ever talks to `LLM_BASE_URL`, so the gateway can be
swapped for a provider directly without touching application code.

```
Cognify backend → OmniRoute (:20128) → Ollama (:11434) → model
```

**Node version.** OmniRoute requires Node >= 22.22.2; the rest of the stack runs
on Node 20. Both are installed via nvm and the default stays at 20 — pm2 starts
OmniRoute with an explicit Node 22 interpreter (see `ecosystem.config.cjs`).
Installing it under Node 20 silently resolves to an old, broken release.

**Binding.** OmniRoute defaults to `0.0.0.0` and serves an *unauthenticated*
`/v1` inference plane. It must be started with `OMNIROUTE_SERVER_HOST=127.0.0.1`
(set in the pm2 config). Either bind loopback or set `REQUIRE_API_KEY=true`.

**Providers.** Configured with the local Ollama as priority 1:

```bash
omniroute providers add ollama-local --name ollama --no-credential \
  --default-model 'gemma4:31b-cloud' --priority 1 \
  --provider-specific-data '{"baseUrl":"http://127.0.0.1:11434"}'
```

Its keyless free-tier providers were not usable in practice (OpenCode returns
403 outside its own client; Felo returns 400), so a working backend is required
rather than optional.

## Frontend (Cognify 2.1)

The React app lives in `src/` (entry `src/main.tsx`, routes in `src/App.tsx`):

| Route | Page | Modelled on |
|---|---|---|
| `/` | Landing | Duolingo-style split hero + feature rows |
| `/learn` | Course path (levels → Lesson / Deep dive / Quiz nodes) + right rail (streak, daily quests, leaderboard) | Duolingo |
| `/lesson/:courseId/:levelId` | Full-screen lesson player with Check/Continue bar and a contextual tutor drawer; 60% to pass | Brilliant |
| `/courses` | Course catalog: create any topic, your courses, explore categories | Coursera |
| `/practice` | Code workspace: languages, run history, AI assistant, console/preview | Replit |
| `/tutor` | Chat with history, tutor personas, voice input, web search | ChatGPT |
| `/notes` | Sources · chat with your sources · studio (summary, guide, exam prep, flashcards) | NotebookLM |
| `/community`, `/community/:roomId`, `/community/leaderboard` | Study rooms with AI personas, leagues | Discord |
| `/profile` | Stats, activity heatmap, badges, daily goal | GitHub |

Old URLs (`/home`, `/roadmap`, `/playground`, `/chatbot`, `/leaderboard`) redirect.
Build for production with `npm run build:prod` (Tailwind v4, fonts self-hosted via Fontsource).
