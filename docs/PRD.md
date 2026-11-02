# Cognify — Product Requirements Document

| | |
|---|---|
| **Product** | Cognify — AI-guided learning platform |
| **URL** | https://cognify.ourspaces.net |
| **Version** | 2.1 (live) |
| **Owner** | Vectorplayzz |
| **Status** | Live; planned availability through January 2027 |
| **Last updated** | 2026-11-02 |

---

## 1. Summary

Cognify turns any topic a learner names into a structured course and teaches it. Each course is a path of levels; each level has a written lesson, deeper sub-modules and a quiz the learner must pass to move on. Around that core sit an AI tutor, a sandboxed code workspace, a study-notes studio that works from the learner's own material, study rooms, and game mechanics (XP, levels, streaks, quests, badges, leagues) that make daily practice stick.

The product borrows proven patterns from category leaders: Duolingo's path and streaks, Brilliant's step-by-step lesson player, ChatGPT's chat, Replit's coding workspace, NotebookLM's source-grounded notes and Discord's rooms.

## 2. Problem

Self-directed learners face three problems:

1. **No structure.** "Learn Kubernetes" or "learn linear algebra" has no obvious starting point or order. Learners bounce between tutorials and lose momentum.
2. **Passive content.** Reading and watching without checks gives a false sense of progress.
3. **Scattered tools.** Explanations, practice, notes and motivation live in separate apps that know nothing about each other.

## 3. Goals and non-goals

### Goals
- **G1 — Structure on demand.** Any topic becomes an ordered, levelled course within seconds.
- **G2 — Active learning.** Every level ends in a quiz that must be passed (≥ 60%) to progress.
- **G3 — Help in context.** The tutor is available inside a lesson and knows what the learner is reading.
- **G4 — Daily habit.** Streaks, daily quests, XP and leagues give a reason to return every day.
- **G5 — One place.** Lessons, tutor, code practice, notes and community share one account and one progress record across devices.

### Non-goals (this release)
- Accredited certificates or graded human assessment.
- Native mobile apps (the web app is responsive and installable as a PWA).
- Payments, subscriptions or paid tiers.
- Instructor-authored course marketplaces.
- Real-time video or voice rooms.

## 4. Users

| Persona | Description | Key needs |
|---|---|---|
| **Self-learner** | Student or career-switcher learning a technical topic alone | A clear path, short sessions, proof of progress |
| **Exam crammer** | University student with lecture PDFs and an exam date | Summaries, flashcards and practice questions from *their* material |
| **Beginner coder** | Learning to program, needs to run code without setup | A zero-install editor, readable errors, explanations |
| **Study group** | Friends learning together | A shared room, a way to ask an AI mid-discussion, friendly competition |

## 5. User journeys

1. **First visit → first lesson.** Landing page → "Get started" → create an account (Google or email + password) → land on Learn → name a topic in Courses → course is built → tap START on the first node → lesson player.
2. **Daily session.** Open the app → Learn shows today's streak, quests and the next node → finish one lesson and its quiz → XP, streak and league update.
3. **Stuck mid-lesson.** In the lesson player → "Ask tutor" → a side panel that already knows the course, level and the text on screen.
4. **Exam prep.** Notes → add lecture PDFs → ask questions with cited answers → generate a study guide, exam prep or flashcards → export as PDF or slides.
5. **Coding practice.** Practice → pick a language → write or generate code → Run → on error, "Explain this error" → AI review.
6. **Group study.** Community → create a room → share the 8-character invite code → chat and summon @Socrates, @Ada, @Newton or @Turing.

## 6. Functional requirements

Priority: **P0** = must work for launch, **P1** = important, **P2** = nice to have. Status reflects the live product.

### 6.1 Accounts and authentication

| ID | Requirement | Priority | Status |
|---|---|---|---|
| AUTH-1 | Sign in with Google; the server verifies the Google token's audience before issuing a session | P0 | ✅ |
| AUTH-2 | Sign up and sign in with email + password | P0 | ✅ |
| AUTH-3 | One account per email; a Google sign-in with a verified matching email links to the existing password account | P0 | ✅ |
| AUTH-4 | Passwords: ≥ 8 characters, salted scrypt hashes, never returned by any API | P0 | ✅ |
| AUTH-5 | Same response for unknown email and wrong password; lockout after 8 failures per email for 15 minutes; 20 auth requests/min per IP | P0 | ✅ |
| AUTH-6 | Signed sessions valid for 7 days; expired sessions return to the sign-in dialog | P0 | ✅ |
| AUTH-7 | Add or change a password from Profile (current password required to change) | P1 | ✅ |
| AUTH-8 | Password reset by email | P1 | ⏳ Needs an email provider |
| AUTH-9 | Direct `/login` and `/signup` links | P2 | ✅ |

### 6.2 Courses (catalog)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| CRS-1 | Create a course from any free-text topic | P0 | ✅ |
| CRS-2 | Use the community roadmap.sh curriculum when one matches; otherwise generate levels with AI | P0 | ✅ |
| CRS-3 | Re-requesting an existing topic opens the learner's existing course instead of duplicating it | P0 | ✅ |
| CRS-4 | "My courses" with progress, next level and delete | P0 | ✅ |
| CRS-5 | Explore catalog of preset topics in six categories | P1 | ✅ |
| CRS-6 | 30 course resolutions/min per user | P1 | ✅ |

### 6.3 Learn (path)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| LRN-1 | Show the active course as a path: each level is a unit banner followed by Lesson → Deep dive → Quiz nodes | P0 | ✅ |
| LRN-2 | Node states: done, current (highlighted with START/CONTINUE), open, locked. A level unlocks only after the previous level's quiz is passed | P0 | ✅ |
| LRN-3 | Course switcher and per-level guidebook | P1 | ✅ |
| LRN-4 | Right rail: streak week, daily quests, leaderboard snippet | P1 | ✅ |
| LRN-5 | Resume where the learner left off inside a level | P1 | ✅ |

### 6.4 Lesson player

| ID | Requirement | Priority | Status |
|---|---|---|---|
| LSN-1 | Full-screen, step-by-step flow: overview → up to 6 sub-modules → quiz questions → result | P0 | ✅ |
| LSN-2 | Content generated on first visit, streamed as it is written, and saved so it is generated once | P0 | ✅ |
| LSN-3 | One question per screen with Check → instant correct/incorrect feedback and explanation | P0 | ✅ |
| LSN-4 | Pass mark 60%. Passing completes the level and awards its XP once; failing offers retry and review | P0 | ✅ |
| LSN-5 | A level cannot be completed without a quiz; if the quiz can't be generated the learner gets a retry | P0 | ✅ |
| LSN-6 | Contextual tutor panel that sees the current step; conversations saved to the Tutor history | P1 | ✅ |
| LSN-7 | Markdown, code highlighting and math (KaTeX) rendering | P1 | ✅ |
| LSN-8 | Keyboard: 1–4 to choose, Enter to check or continue | P2 | ✅ |

### 6.5 AI tutor

| ID | Requirement | Priority | Status |
|---|---|---|---|
| TUT-1 | Streaming chat with saved conversation history (search, rename, delete, clear all) | P0 | ✅ |
| TUT-2 | Up to 24 recent messages sent as context | P0 | ✅ |
| TUT-3 | Selectable tutors: Cognify, Socrates, Ada, Newton, Turing | P1 | ✅ |
| TUT-4 | Web search for questions that need fresh facts (self-hosted SearXNG) | P1 | ✅ |
| TUT-5 | Voice input, read-aloud, copy and regenerate | P2 | ✅ |

### 6.6 Practice (code workspace)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| PRC-1 | Run Python, JavaScript, Java, Go, Rust, C and C++ in an isolated sandbox (self-hosted Piston) | P0 | ✅ |
| PRC-2 | Live HTML/CSS/JS preview in a sandboxed iframe | P0 | ✅ |
| PRC-3 | Syntax-highlighted editor, stdin input, Ctrl/⌘ + Enter to run, drafts saved per language | P0 | ✅ |
| PRC-4 | Run history (last 40 runs), reloadable into the editor | P1 | ✅ |
| PRC-5 | AI: generate code from a prompt, review code, explain a failed run | P1 | ✅ |
| PRC-6 | 20 executions/min per user | P0 | ✅ |

### 6.7 Notes (source-grounded study material)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| NTS-1 | Add sources: PDF, TXT, MD uploads (≤ 5 files, ≤ 10 MB each) or pasted text; unreadable files are reported | P0 | ✅ |
| NTS-2 | Sources library with select/deselect and delete | P0 | ✅ |
| NTS-3 | Chat with selected sources; answers use only those sources and cite them | P0 | ✅ |
| NTS-4 | Generate summary, study guide, exam prep or flashcards from selected sources | P0 | ✅ |
| NTS-5 | Saved notes list; flashcards shown as flip cards | P1 | ✅ |
| NTS-6 | Export as PDF (print) and PowerPoint slides | P1 | ✅ |
| NTS-7 | Retrieval is private to each user; deleting a note removes its sources and embeddings | P0 | ✅ |

### 6.8 Community

| ID | Requirement | Priority | Status |
|---|---|---|---|
| COM-1 | Create rooms and join with an 8-character invite code (joins rate-limited) | P0 | ✅ |
| COM-2 | Room chat with members list; the creator can rotate the invite code | P0 | ✅ |
| COM-3 | Summon AI personas with @mentions; personas can only post as themselves | P1 | ✅ |
| COM-4 | Leaderboard ranked by total XP with Bronze → Diamond tiers; other learners' names shortened for privacy | P1 | ✅ |

### 6.9 Progress and gamification

| ID | Requirement | Priority | Status |
|---|---|---|---|
| GAM-1 | XP awarded server-side from completed levels, validated against the stored course; each level's XP counts once, even if the course is deleted and re-created | P0 | ✅ |
| GAM-2 | Level = every 200 XP; ranks from Beginner to AI Oracle | P0 | ✅ |
| GAM-3 | Daily streak counts days with a completed level, tutor message, code run or note | P0 | ✅ |
| GAM-4 | Daily quests: earn the daily XP goal (50/100/200/400), ask the tutor 3 questions, run code twice | P1 | ✅ |
| GAM-5 | Eight badges | P1 | ✅ |
| GAM-6 | Progress follows the learner across devices; concurrent saves merge instead of overwriting | P0 | ✅ |

### 6.10 Profile

| ID | Requirement | Priority | Status |
|---|---|---|---|
| PRF-1 | Stats: streak, best streak, XP, levels, quizzes, average score | P1 | ✅ |
| PRF-2 | 26-week activity heatmap | P2 | ✅ |
| PRF-3 | Badges, course progress, daily goal, theme, sign-in methods | P1 | ✅ |

### 6.11 Cross-cutting

| ID | Requirement | Priority | Status |
|---|---|---|---|
| X-1 | Light and dark themes; responsive down to 360 px with a mobile tab bar | P0 | ✅ |
| X-2 | Command palette (⌘/Ctrl + K) for navigation, courses and quick actions | P2 | ✅ |
| X-3 | When the AI is down, a site-wide notice explains what still works | P0 | ✅ |
| X-4 | Recovery screen on crashes; reload prompt after a deploy; 404 page | P0 | ✅ |
| X-5 | Old URLs (`/home`, `/roadmap`, `/playground`, `/chatbot`, `/leaderboard`) redirect | P2 | ✅ |
| X-6 | Open Graph/Twitter cards, manifest, icons, robots.txt, sitemap | P2 | ✅ |

## 7. Non-functional requirements

### Performance
- Static assets served by nginx behind Cloudflare; hashed assets cached for a year.
- Database co-located with the API (local MariaDB): about 2 ms per query.
- AI responses stream token by token; first tokens typically within about 1 second.
- Feature pages are code-split, so the landing page loads only what it needs.

### Reliability
- API supervised by PM2; it keeps serving and retries in the background if the database is briefly unreachable.
- AI provider: Groq, trying `gpt-oss-120b`, then `gpt-oss-20b`, then `qwen3.8-27b` on rate limits or errors.
- AI health reflects real request outcomes and is exposed at `/api/llm/status`. Service health is at `/api/health`.
- Errors return JSON. Gateway errors are reported as 503 so Cloudflare does not replace them with its own page.

### Security and privacy
- HTTPS with HSTS. Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy (microphone allowed only for voice input).
- Every data route requires a session. Identity always comes from the session token, never from IDs sent by the client.
- Rate limits per user (or per IP before sign-in) on auth, course creation, AI, search, code execution, uploads and retrieval.
- API keys stay on the server; the browser never calls AI or search providers directly.
- Chat and AI output render as markdown with raw HTML disabled, so one user's content can't inject markup into another's page.
- Code runs in an isolated sandbox; HTML preview runs in a sandboxed iframe.
- Dotfiles and backup-style paths return 404.

### Accessibility
- Keyboard-reachable controls, visible focus rings, `prefers-reduced-motion` respected, sufficient contrast in both themes.

## 8. Architecture overview

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Vite 6, Tailwind CSS 4, Motion, CodeMirror 6, react-markdown + KaTeX, self-hosted fonts |
| API | Node.js (Express 5), signed stateless sessions, in-process rate limiting |
| Database | MariaDB 10.11 (local) |
| AI | Groq (OpenAI-compatible) through a server-side proxy |
| Embeddings / retrieval | Ollama `nomic-embed-text`, vectors stored in MariaDB |
| Code execution | Piston (Docker, localhost only) |
| Web search | SearXNG (Docker, localhost only) |
| Edge | nginx + Let's Encrypt, behind Cloudflare |

Main data entities: users, roadmaps (courses), user_progress, xp_ledger, level_content, level_quizzes, chat_sessions, chat_messages, code_history, notes, note_sources, note_embeddings, note_source_links, chat_rooms, room_members, room_messages.

## 9. Success metrics

| Metric | Definition | Target |
|---|---|---|
| Activation | New accounts that complete a first level within 24 h | ≥ 40% |
| Day-7 retention | Learners active on day 7 after sign-up | ≥ 20% |
| Streak depth | Median active streak among weekly active learners | ≥ 3 days |
| Quiz pass rate | Quiz attempts reaching the 60% pass mark | 60–80% (too high means quizzes are too easy) |
| Tutor engagement | Weekly active learners who send at least one tutor message | ≥ 50% |
| AI reliability | AI requests answered without error | ≥ 99% |

Data sources: `xp_ledger`, `chat_messages`, `code_history`, `notes`, `users.last_active_date` (also exposed per user by `/api/me/activity`).

## 10. Current status (2026-11-02)

- All P0 requirements above are live and covered by automated backend tests (113) plus end-to-end browser runs against production.
- 8 registered learners, 17 courses, 9 tutor conversations, 2 saved notes, 2 study rooms.

## 11. Risks and open issues

| Risk / issue | Impact | Mitigation / next step |
|---|---|---|
| No password-reset email | Password-only users who forget their password need manual help | Add an email provider (e.g. Resend) and a reset-token flow (AUTH-8) |
| Groq free-tier rate limits | Slower or failed AI at peak load | Three-model fallback; move to a paid tier if usage grows |
| Single server, no automated database backups | Data loss if the server fails | Accepted for the planned lifespan; one manual dump exists |
| AI-generated content can be wrong | Learners may learn errors | Tutor and lesson labelled as AI; roadmap.sh curricula preferred where available |
| In-memory rate limiting | Limits reset on restart and won't scale past one process | Move to Redis if the API is scaled out |
| Slide-export library advisory (`image-size`) | Theoretical DoS, browser-only | Track upstream fix |

## 12. Future scope (post-2.1, if the product continues)

- Password reset and email verification.
- Spaced-repetition review of past quiz mistakes.
- Shareable course links and course templates.
- Teacher mode: assign a course to a room and see members' progress.
- Offline-capable PWA with cached lessons.
- Analytics dashboard for the metrics in section 9.

## Appendix A — Routes

| Path | Page |
|---|---|
| `/` | Landing |
| `/login`, `/signup` | Landing with the auth dialog open |
| `/learn` | Course path |
| `/courses` | Course catalog |
| `/lesson/:courseId/:levelId` | Lesson player |
| `/practice` | Code workspace |
| `/tutor` | AI tutor |
| `/notes` | Notes studio |
| `/community`, `/community/:roomId`, `/community/leaderboard` | Rooms and leagues |
| `/profile` | Profile |

## Appendix B — Key API endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/google`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/password`, `GET /api/auth/me` |
| Courses | `GET /api/roadmaps/resolve`, `GET /api/roadmaps/check`, `POST /api/roadmaps`, `GET /api/roadmaps/user/:id`, `DELETE /api/roadmaps/:id` |
| Lessons | `GET/PUT /api/level-content`, `GET/PUT /api/level-quiz` |
| Progress | `PUT /api/progress`, `GET /api/progress/:userId`, `GET /api/leaderboard`, `GET /api/me/activity` |
| Tutor | `POST /api/llm/chat` (streaming), `/api/chat/sessions`, `/api/chat/messages`, `POST /api/search/web` |
| Practice | `POST /api/execute`, `GET /api/execute/languages`, `/api/code-history` |
| Notes | `POST /api/notes/upload-files`, `/api/notes/sources`, `GET /api/notes/my-sources`, `POST /api/notes/retrieve`, `/api/notes/notes` |
| Rooms | `POST /api/rooms`, `POST /api/rooms/join`, `GET/POST /api/rooms/:id/messages` |
| Status | `GET /api/health`, `GET /api/llm/status`, `GET /api/public/stats` |
