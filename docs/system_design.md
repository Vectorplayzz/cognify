
# CognifyAi Platform Technical Architecture

## 1. System Architecture
CognifyAi follows a microservices-inspired modular architecture:
- **Client (React/TS):** Single Page Application handling complex state for roadmaps and code editing.
- **Gateway/Primary API (Node.js/Express):** Handles JWT Auth, RBAC, Roadmap management, and Gamification logic.
- **AI Core (Python/FastAPI):** Specialized service for code analysis, notebook execution wrappers, and heavy LLM orchestration.
- **Database Layer:** PostgreSQL for relational data, Redis for real-time leaderboards and session caching.
- **Sandbox Service:** Docker-based execution environment (e.g., using `nsjail`) to safely run user-submitted code.

## 2. Database Schema (PostgreSQL)
- **Users:** `id, email, password_hash, role(student|admin), xp, streak_count, last_login`.
- **Roadmaps:** `id, title, description, difficulty(beginner|intermediate|advanced)`.
- **Nodes/Topics:** `id, roadmap_id, title, content_md, order_index, type(video|note|lab)`.
- **Quizzes:** `id, topic_id, questions_json, passing_score`.
- **UserProgress:** `user_id, node_id, status(locked|in_progress|completed), score`.
- **Badges:** `id, name, icon_url, criteria_json`.
- **Leaderboard (Cached in Redis):** Sorted sets for `weekly_xp` and `all_time_xp`.

## 3. Code Execution Sandbox Design
1. **Request:** Frontend sends code + language to Node.js.
2. **Validation:** Node.js checks user permissions and rate limits.
3. **Dispatch:** Node.js calls the Python AI Core.
4. **Execution:** Python Core spins up a transient Docker container with limited CPU (0.1), Memory (128MB), and no network.
5. **Output:** Captures `stdout/stderr`, sends to Frontend.
6. **AI Analysis:** Simultaneously, Gemini analyzes the code for "Hint-based Debugging" if an error occurs.

## 4. Gamification Logic
- **XP Formula:** `XP = (Difficulty_Factor * Base_Points) + Streak_Bonus`.
- **Ranks:** 0-500 (Novice), 501-2000 (Scripter), 2001-10000 (AI Architect).
- **Daily Streaks:** Reset if `last_login` > 24h.

## 5. Development Roadmap
- **Phase 1 (MVP):** Auth + Roadmap UI + Markdown Notes.
- **Phase 2 (AI):** Gemini integration for Code Hints and Chat.
- **Phase 3 (Hands-on):** Code Playground + Sandboxed Execution.
- **Phase 4 (Social):** Leaderboards + Community Forums.
