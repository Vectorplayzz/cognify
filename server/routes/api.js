/**
 * REST API Routes for Cognify
 * MySQL implementation with new database backend
 */
import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import notesRoutes from './notes.js';
import * as codeExecution from '../services/codeExecution/index.js';
import * as roadmapService from '../services/roadmap/index.js';
import * as llmProxy from '../services/llmProxy.js';
import * as searchProxy from '../services/searchProxy.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireAuth, assertSelf } from '../middleware/auth.js';
import { issueSession } from '../auth/session.js';
import { verifyGoogleAccessToken, GoogleAuthError } from '../auth/google.js';
import * as gamification from '../services/gamification.js';

const router = Router();

// ── Authentication gate ──
// Everything requires a signed-in user except sign-in itself and a few
// read-only status endpoints that expose nothing user-specific.
const PUBLIC_ROUTES = new Set([
    'POST /auth/google',
    'GET /roadmaps/catalog',
    'GET /execute/languages',
    'GET /health/piston',
    'GET /llm/status',
    'GET /search/status',
    'GET /health',
]);

router.use((req, res, next) => {
    if (PUBLIC_ROUTES.has(`${req.method} ${req.path}`)) return next();
    return requireAuth(req, res, next);
});

// ── Health (public, for uptime monitors; nginx only proxies /api) ──
router.get('/health', async (req, res) => {
    const started = Date.now();
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'ok', dbLatencyMs: Date.now() - started, timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'degraded', db: 'unreachable', timestamp: new Date().toISOString() });
    }
});

// ── Limits ──
const MAX_XP = 10_000_000;
const MAX_MESSAGE_CHARS = 100_000;

// ── Helpers ──
function parseJson(value, fallback) {
    if (typeof value !== 'string') return value ?? fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

function parseRoadmapRow(row) {
    return { ...row, levels: parseJson(row.levels, []), source: parseJson(row.source, null) };
}

/** Keep only the known attribution fields, so clients cannot store arbitrary blobs. */
function sanitizeSource(source) {
    if (!source || typeof source !== 'object') return null;
    const out = {};
    for (const key of ['source', 'sourceSlug', 'sourceUrl', 'sourceProvider']) {
        if (typeof source[key] === 'string' && source[key].length <= 300) out[key] = source[key];
    }
    if (out.sourceUrl && !/^https:\/\/roadmap\.sh\//.test(out.sourceUrl)) delete out.sourceUrl;
    return Object.keys(out).length ? out : null;
}

// Cloudflare sits in front of nginx and replaces any 502/504 from the origin
// with its own HTML error page, hiding our JSON. Report upstream failures as 503.
function edgeSafe(status) {
    return status === 502 || status === 504 ? 503 : status;
}

function clampLimit(value, fallback, max) {
    const n = parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

async function ownsRoadmap(userId, roadmapId) {
    const [rows] = await pool.query('SELECT 1 FROM roadmaps WHERE id = ? AND user_id = ?', [roadmapId, userId]);
    return rows.length > 0;
}

async function ownsSession(userId, sessionId) {
    const [rows] = await pool.query('SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
    return rows.length > 0;
}

async function isRoomMember(userId, roomId) {
    const [rows] = await pool.query('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
    return rows.length > 0;
}

// ── Logging helper ──
function log(tag, msg) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`\x1b[2m${ts}\x1b[0m \x1b[35m[${tag}]\x1b[0m ${msg}`);
}

// ══════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════
//
// Identity is established once, here: the browser hands over its Google
// access token, we verify it with Google, and issue a Cognify session token.
// Every other route reads the user from that token (req.user), never from
// ids in the request.

const authLimiter = rateLimit({ windowMs: 60000, max: Number(process.env.AUTH_RATE_LIMIT_PER_MIN || 20), keyPrefix: 'auth' });

router.post('/auth/google', authLimiter, async (req, res) => {
    try {
        const profile = await verifyGoogleAccessToken(req.body?.access_token);
        await pool.query(
            `INSERT INTO users (google_id, name, email, picture)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                email = VALUES(email),
                picture = VALUES(picture),
                updated_at = CURRENT_TIMESTAMP`,
            [profile.googleId, profile.name, profile.email, profile.picture]
        );
        const [rows] = await pool.query('SELECT id FROM users WHERE google_id = ?', [profile.googleId]);
        const user = await gamification.getUser(rows[0].id);
        const session = issueSession({ userId: user.id, googleId: user.google_id });
        log('Auth', `Signed in user id=${user.id}`);
        res.json({ user, token: session.token, expiresAt: session.expiresAt });
    } catch (err) {
        if (err instanceof GoogleAuthError) {
            log('Auth', `Sign-in rejected: ${err.code}`);
            return res.status(err.status).json({ error: err.message, code: err.code });
        }
        console.error('[API] Sign-in error:', err);
        res.status(500).json({ error: 'Sign-in failed' });
    }
});

router.get('/auth/me', async (req, res) => {
    try {
        const user = await gamification.getUser(req.user.id);
        if (!user) return res.status(401).json({ error: 'Account no longer exists', code: 'invalid_session' });
        res.json(user);
    } catch (err) {
        console.error('[API] Get current user error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════

router.get('/users/:googleId', async (req, res) => {
    if (req.params.googleId !== req.user.googleId) {
        return res.status(403).json({ error: 'You do not have access to this resource', code: 'forbidden' });
    }
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Get user error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// XP is computed on the server from completed levels (see PUT /progress);
// a client-sent xp value is ignored. Only earned badge ids are stored here.
const KNOWN_REWARDS = new Set(['first-quiz', 'xp-500', 'xp-1000', 'xp-2500', 'xp-5000', 'xp-10000', 'perfect-quiz', 'three-roadmaps']);

router.put('/users/:id/xp', async (req, res) => {
    if (!assertSelf(req, res, req.params.id)) return;
    try {
        const current = await gamification.getUser(req.user.id);
        if (!current) return res.status(404).json({ error: 'User not found' });
        const incoming = Array.isArray(req.body?.rewards) ? req.body.rewards.filter((r) => KNOWN_REWARDS.has(r)) : [];
        const merged = Array.from(new Set([...(Array.isArray(current.rewards) ? current.rewards : []), ...incoming]));
        if (merged.length !== (current.rewards || []).length) {
            await pool.query('UPDATE users SET rewards = ? WHERE id = ?', [JSON.stringify(merged), req.user.id]);
        }
        res.json(await gamification.getUser(req.user.id));
    } catch (err) {
        console.error('[API] Update rewards error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Leaderboard ──
router.get('/leaderboard', async (req, res) => {
    try {
        res.json(await gamification.leaderboard(req.user.id, req.query.limit));
    } catch (err) {
        console.error('[API] Leaderboard error:', err);
        res.status(500).json({ error: 'Failed to load the leaderboard' });
    }
});

// ══════════════════════════════════════════
//  ROADMAPS
// ══════════════════════════════════════════

// ── Roadmap source resolution (roadmap.sh first, AI fallback) ──
// Declared before /roadmaps/:id so the param route does not swallow them.

const roadmapLimiter = rateLimit({
    windowMs: 60000,
    max: Number(process.env.ROADMAP_RATE_LIMIT_PER_MIN || 30),
    keyPrefix: 'roadmap',
});

router.get('/roadmaps/catalog', async (req, res) => {
    try {
        res.json({ success: true, roadmaps: await roadmapService.listCatalog() });
    } catch (err) {
        console.error('[API] Roadmap catalog error:', err.message);
        res.status(503).json({ success: false, error: 'Roadmap catalog is currently unavailable.' });
    }
});

// The one endpoint the frontend uses; it does not know or care which
// source answered.
router.get('/roadmaps/resolve', roadmapLimiter, async (req, res) => {
    const topic = req.query.topic;
    try {
        const { source, roadmap, resolution } = await roadmapService.getRoadmap(topic);
        res.json({ success: true, source, resolution, roadmap });
    } catch (err) {
        if (err instanceof roadmapService.RoadmapError) {
            return res.status(err.status).json({ success: false, error: err.message, code: err.code });
        }
        console.error('[API] Roadmap resolve error:', err);
        res.status(500).json({ success: false, error: 'Failed to resolve roadmap.' });
    }
});

router.get('/roadmaps/check', async (req, res) => {
    try {
        const { topic } = req.query;
        if (!topic) return res.status(400).json({ error: 'topic required' });
        const [rows] = await pool.query(
            'SELECT * FROM roadmaps WHERE user_id = ? AND LOWER(topic) = LOWER(?)',
            [req.user.id, topic]
        );
        if (rows.length > 0) return res.json({ exists: true, roadmap: parseRoadmapRow(rows[0]) });
        res.json({ exists: false });
    } catch (err) {
        console.error('[API] Check roadmap error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/roadmaps', async (req, res) => {
    const userId = req.user.id;
    try {
        const { client_id, topic, levels, source } = req.body || {};
        if (typeof topic !== 'string' || !topic.trim() || topic.length > 255) {
            return res.status(400).json({ error: 'topic must be a non-empty string of at most 255 characters' });
        }
        if (!Array.isArray(levels) || levels.length === 0 || levels.length > 200) {
            return res.status(400).json({ error: 'levels must be a non-empty array' });
        }
        log('Roadmaps', `Create: "${topic}" for user=${userId}`);

        const [existing] = await pool.query(
            'SELECT * FROM roadmaps WHERE user_id = ? AND LOWER(topic) = LOWER(?)',
            [userId, topic]
        );
        if (existing.length > 0) return res.json({ ...parseRoadmapRow(existing[0]), existing: true });

        const [result] = await pool.query(
            `INSERT INTO roadmaps (user_id, client_id, topic, levels, source)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, typeof client_id === 'string' ? client_id.slice(0, 255) : null, topic, JSON.stringify(levels), JSON.stringify(sanitizeSource(source))]
        );
        const [rows] = await pool.query('SELECT * FROM roadmaps WHERE id = ?', [result.insertId]);
        res.json({ ...parseRoadmapRow(rows[0]), existing: false });
    } catch (err) {
        // MySQL error 1062 = duplicate entry (a concurrent create won the race)
        if (err.code === 'ER_DUP_ENTRY') {
            const [existing] = await pool.query(
                'SELECT * FROM roadmaps WHERE user_id = ? AND LOWER(topic) = LOWER(?)',
                [userId, req.body.topic]
            );
            if (existing.length > 0) return res.json({ ...parseRoadmapRow(existing[0]), existing: true });
        }
        console.error('[API] Create roadmap error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/roadmaps/user/:userId', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM roadmaps WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        log('Roadmaps', `Fetched ${rows.length} roadmaps for user=${req.user.id}`);
        res.json(rows.map(parseRoadmapRow));
    } catch (err) {
        console.error('[API] Get roadmaps error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/roadmaps/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM roadmaps WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Roadmap not found' });
        res.json(parseRoadmapRow(rows[0]));
    } catch (err) {
        console.error('[API] Get roadmap error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/roadmaps/:id', async (req, res) => {
    try {
        log('Roadmaps', `Delete roadmap id=${req.params.id} user=${req.user.id}`);
        const [result] = await pool.query('DELETE FROM roadmaps WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Roadmap not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[API] Delete roadmap error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════
//  PROGRESS
// ══════════════════════════════════════════

router.put('/progress', async (req, res) => {
    try {
        const { roadmap_id, completed_levels, quiz_results } = req.body || {};
        if (!roadmap_id) return res.status(400).json({ error: 'roadmap_id required' });
        if (!(await ownsRoadmap(req.user.id, roadmap_id))) return res.status(404).json({ error: 'Roadmap not found' });
        log('Progress', `Upsert: user=${req.user.id} roadmap=${roadmap_id}`);

        await pool.query(
            `INSERT INTO user_progress (user_id, roadmap_id, completed_levels, quiz_results, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                completed_levels = VALUES(completed_levels),
                quiz_results = VALUES(quiz_results),
                updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, roadmap_id, JSON.stringify(Array.isArray(completed_levels) ? completed_levels : []), JSON.stringify(Array.isArray(quiz_results) ? quiz_results : [])]
        );
        await gamification.awardCompletedLevels(req.user.id, roadmap_id, completed_levels);
        await gamification.recordActivity(req.user.id);
        const [rows] = await pool.query(
            'SELECT * FROM user_progress WHERE user_id = ? AND roadmap_id = ?',
            [req.user.id, roadmap_id]
        );
        res.json({ ...rows[0], user: await gamification.getUser(req.user.id) });
    } catch (err) {
        console.error('[API] Upsert progress error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/progress/:userId/:roadmapId', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM user_progress WHERE user_id = ? AND roadmap_id = ?',
            [req.user.id, req.params.roadmapId]
        );
        res.json(rows[0] || null);
    } catch (err) {
        console.error('[API] Get progress error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/progress/:userId', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
        const [rows] = await pool.query('SELECT * FROM user_progress WHERE user_id = ?', [req.user.id]);
        res.json(rows);
    } catch (err) {
        console.error('[API] Get all progress error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════
//  CHAT SESSIONS
// ══════════════════════════════════════════

router.post('/chat/sessions', async (req, res) => {
    try {
        const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.slice(0, 255) : 'New Chat';
        log('Chat', `New session: user=${req.user.id}`);
        const [result] = await pool.query(
            'INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)',
            [req.user.id, title]
        );
        const [rows] = await pool.query('SELECT * FROM chat_sessions WHERE id = ?', [result.insertId]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Create session error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/chat/sessions/:userId', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
        const [rows] = await pool.query(`
            SELECT s.*,
                (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) as message_count,
                (SELECT content FROM chat_messages WHERE session_id = s.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_message
            FROM chat_sessions s
            WHERE s.user_id = ?
            ORDER BY s.updated_at DESC
        `, [req.user.id]);
        log('Chat', `Listed ${rows.length} sessions for user=${req.user.id}`);
        res.json(rows);
    } catch (err) {
        console.error('[API] List sessions error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/chat/sessions/:id', async (req, res) => {
    try {
        const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 255) : '';
        if (!title.trim()) return res.status(400).json({ error: 'title required' });
        const [result] = await pool.query(
            'UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [title, req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Session not found' });
        const [rows] = await pool.query('SELECT * FROM chat_sessions WHERE id = ?', [req.params.id]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Update session error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/chat/sessions/:id', async (req, res) => {
    try {
        log('Chat', `Delete session id=${req.params.id} user=${req.user.id}`);
        const [result] = await pool.query('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Session not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[API] Delete session error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Legacy endpoint ──
router.get('/chat/:userId', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT ?',
            [req.user.id, clampLimit(req.query.limit, 100, 500)]
        );
        res.json(rows);
    } catch (err) {
        console.error('[API] Get chat error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════
//  CHAT MESSAGES
// ══════════════════════════════════════════

const CHAT_ROLES = new Set(['user', 'assistant']);

router.post('/chat/messages', async (req, res) => {
    try {
        const { session_id, role, content } = req.body || {};
        if (!session_id || !role || typeof content !== 'string' || !content) {
            return res.status(400).json({ error: 'session_id, role, content required' });
        }
        if (!CHAT_ROLES.has(role)) return res.status(400).json({ error: 'role must be user or assistant' });
        if (content.length > MAX_MESSAGE_CHARS) return res.status(413).json({ error: 'Message is too long' });
        if (!(await ownsSession(req.user.id, session_id))) return res.status(404).json({ error: 'Session not found' });
        log('Chat', `Save: session=${session_id} role=${role} len=${content.length}`);

        const [result] = await pool.query(
            `INSERT INTO chat_messages (user_id, session_id, role, content)
             VALUES (?, ?, ?, ?)`,
            [req.user.id, session_id, role, content]
        );
        await pool.query('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [session_id]);

        // Auto-set title from first user message
        if (role === 'user') {
            gamification.touchActivity(req.user.id);
            await pool.query(
                `UPDATE chat_sessions SET title = ? WHERE id = ? AND title = 'New Chat'`,
                [content.substring(0, 80), session_id]
            );
        }

        const [rows] = await pool.query('SELECT * FROM chat_messages WHERE id = ?', [result.insertId]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Save message error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/chat/messages/:sessionId', async (req, res) => {
    try {
        if (!(await ownsSession(req.user.id, req.params.sessionId))) return res.status(404).json({ error: 'Session not found' });
        const [rows] = await pool.query(
            'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
            [req.params.sessionId]
        );
        log('Chat', `Loaded ${rows.length} messages for session=${req.params.sessionId}`);
        res.json(rows);
    } catch (err) {
        console.error('[API] Get messages error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/chat/:userId', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
        log('Chat', `Clear all: user=${req.user.id}`);
        await pool.query('DELETE FROM chat_sessions WHERE user_id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('[API] Clear chat error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════
//  CODE HISTORY
// ══════════════════════════════════════════

router.post('/code-history', async (req, res) => {
    try {
        const { language, code, stdin, output } = req.body || {};
        if (typeof language !== 'string' || !language || typeof code !== 'string' || !code) {
            return res.status(400).json({ error: 'language and code required' });
        }
        if (code.length > MAX_MESSAGE_CHARS) return res.status(413).json({ error: 'Code is too long' });
        log('Code', `Save: user=${req.user.id} lang=${language}`);
        gamification.touchActivity(req.user.id);
        const [result] = await pool.query(
            `INSERT INTO code_history (user_id, language, code, stdin, output)
             VALUES (?, ?, ?, ?, ?)`,
            [req.user.id, language.slice(0, 50), code, String(stdin || '').slice(0, 20000), String(output || '').slice(0, MAX_MESSAGE_CHARS)]
        );
        const [rows] = await pool.query('SELECT * FROM code_history WHERE id = ?', [result.insertId]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Save code error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/code-history/:userId', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM code_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
            [req.user.id, clampLimit(req.query.limit, 20, 200)]
        );
        res.json(rows);
    } catch (err) {
        console.error('[API] Get code history error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════
//  GROUP CHAT ROOMS
// ══════════════════════════════════════════
//
// Rooms are shared: any member may read and post. Only the creator may
// rotate the invite code.

function generateInviteCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Invite codes are 32 bits; throttle joins so they cannot be enumerated.
const joinLimiter = rateLimit({ windowMs: 60000, max: Number(process.env.ROOM_JOIN_RATE_LIMIT_PER_MIN || 10), keyPrefix: 'room-join' });

router.post('/rooms', async (req, res) => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
        if (!name) return res.status(400).json({ error: 'name required' });
        const inviteCode = generateInviteCode();
        log('Rooms', `Create: "${name}" by user=${req.user.id}`);
        const [result] = await pool.query(
            `INSERT INTO chat_rooms (name, created_by, invite_code) VALUES (?, ?, ?)`,
            [name, req.user.id, inviteCode]
        );
        await pool.query(
            `INSERT IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)`,
            [result.insertId, req.user.id]
        );
        log('Rooms', `Created room id=${result.insertId}`);
        const [rows] = await pool.query('SELECT * FROM chat_rooms WHERE id = ?', [result.insertId]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Create room error:', err);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

router.post('/rooms/join', joinLimiter, async (req, res) => {
    try {
        const inviteCode = typeof req.body?.invite_code === 'string' ? req.body.invite_code.trim().toUpperCase() : '';
        if (!inviteCode) return res.status(400).json({ error: 'invite_code required' });
        log('Rooms', `Join attempt: user=${req.user.id}`);
        const [rooms] = await pool.query('SELECT * FROM chat_rooms WHERE invite_code = ?', [inviteCode]);
        if (rooms.length === 0) return res.status(404).json({ error: 'Invalid invite code' });

        const room = rooms[0];
        const [inserted] = await pool.query(
            `INSERT IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)`,
            [room.id, req.user.id]
        );
        // Announce only first-time joins.
        if (inserted.affectedRows > 0) {
            const [users] = await pool.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
            const userName = users[0]?.name || 'Someone';
            await pool.query(
                `INSERT INTO room_messages (room_id, user_id, sender_name, role, content)
                 VALUES (?, ?, ?, 'system', ?)`,
                [room.id, req.user.id, 'System', `${userName} joined the room`]
            );
        }
        log('Rooms', `User ${req.user.id} joined room ${room.id}`);
        res.json(room);
    } catch (err) {
        console.error('[API] Join room error:', err);
        res.status(500).json({ error: 'Failed to join room' });
    }
});

router.post('/rooms/:id/regenerate-code', async (req, res) => {
    try {
        const newCode = generateInviteCode();
        const [result] = await pool.query(
            `UPDATE chat_rooms SET invite_code = ? WHERE id = ? AND created_by = ?`,
            [newCode, req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room not found, or only its creator can change the invite code' });
        }
        log('Rooms', `Regenerated code for room=${req.params.id}`);
        const [rows] = await pool.query('SELECT * FROM chat_rooms WHERE id = ?', [req.params.id]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Regenerate code error:', err);
        res.status(500).json({ error: 'Failed to regenerate code' });
    }
});

router.get('/rooms/user/:userId', async (req, res) => {
    if (!assertSelf(req, res, req.params.userId)) return;
    try {
        const [rows] = await pool.query(`
            SELECT r.*, rm.joined_at,
                (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) as member_count,
                (SELECT content FROM room_messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_message
            FROM chat_rooms r
            JOIN room_members rm ON rm.room_id = r.id
            WHERE rm.user_id = ?
            ORDER BY r.created_at DESC
        `, [req.user.id]);
        log('Rooms', `Fetched ${rows.length} rooms for user=${req.user.id}`);
        res.json(rows);
    } catch (err) {
        console.error('[API] Get rooms error:', err);
        res.status(500).json({ error: 'Failed to load rooms' });
    }
});

router.get('/rooms/:id', async (req, res) => {
    try {
        if (!(await isRoomMember(req.user.id, req.params.id))) return res.status(404).json({ error: 'Room not found' });
        const [rooms] = await pool.query('SELECT * FROM chat_rooms WHERE id = ?', [req.params.id]);
        if (rooms.length === 0) return res.status(404).json({ error: 'Room not found' });
        const [members] = await pool.query(`
            SELECT u.id, u.name, u.picture, rm.joined_at
            FROM room_members rm
            JOIN users u ON u.id = rm.user_id
            WHERE rm.room_id = ?
            ORDER BY rm.joined_at ASC
        `, [req.params.id]);
        res.json({ ...rooms[0], members });
    } catch (err) {
        console.error('[API] Get room error:', err);
        res.status(500).json({ error: 'Failed to load room' });
    }
});

router.get('/rooms/:id/messages', async (req, res) => {
    try {
        if (!(await isRoomMember(req.user.id, req.params.id))) return res.status(404).json({ error: 'Room not found' });
        const limit = clampLimit(req.query.limit, 100, 500);
        const after = req.query.after;
        const [rows] = after
            ? await pool.query('SELECT * FROM room_messages WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT ?', [req.params.id, after, limit])
            : await pool.query('SELECT * FROM room_messages WHERE room_id = ? ORDER BY id DESC LIMIT ?', [req.params.id, limit]);
        // Without ?after, return the most recent page, oldest first.
        res.json(after ? rows : rows.reverse());
    } catch (err) {
        console.error('[API] Get room messages error:', err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// Members post as themselves; the AI personas they invoke post as 'bot'.
// 'system' messages are server-generated only.
const ROOM_ROLES = new Set(['user', 'bot']);
const ROOM_PERSONAS = ['Socrates', 'Ada', 'Newton', 'Turing'];

router.post('/rooms/:id/messages', async (req, res) => {
    try {
        const { content, persona } = req.body || {};
        const role = req.body?.role || 'user';
        if (typeof content !== 'string' || !content) return res.status(400).json({ error: 'content required' });
        if (content.length > MAX_MESSAGE_CHARS) return res.status(413).json({ error: 'Message is too long' });
        if (!ROOM_ROLES.has(role)) return res.status(400).json({ error: 'role must be user or bot' });
        if (!(await isRoomMember(req.user.id, req.params.id))) return res.status(404).json({ error: 'Room not found' });

        let senderName;
        let authorId;
        if (role === 'user') {
            // The display name comes from the account, so members cannot post as each other.
            const [users] = await pool.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
            senderName = users[0]?.name || 'Unknown';
            authorId = req.user.id;
        } else {
            // Bot messages may only speak as one of the known personas, so a
            // member cannot post as "System" or as another person.
            const persona = ROOM_PERSONAS.find((p) => p.toLowerCase() === String(req.body?.persona || req.body?.sender_name || '').toLowerCase());
            senderName = persona || 'Assistant';
            req.body.persona = persona || null;
            authorId = null;
        }
        log('Rooms', `Message in room=${req.params.id} from user=${req.user.id} role=${role}`);

        const [result] = await pool.query(
            `INSERT INTO room_messages (room_id, user_id, sender_name, role, content, persona)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.params.id, authorId, senderName, role, content, role === 'bot' ? req.body.persona : null]
        );
        const [rows] = await pool.query('SELECT * FROM room_messages WHERE id = ?', [result.insertId]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Post room message error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ══════════════════════════════════════════
//  LEVEL CONTENT & QUIZZES
// ══════════════════════════════════════════
//
// Keyed by roadmap, so access follows roadmap ownership.

router.get('/level-content/:roadmapId/:levelId', async (req, res) => {
    try {
        if (!(await ownsRoadmap(req.user.id, req.params.roadmapId))) return res.status(404).json({ error: 'Roadmap not found' });
        const [rows] = await pool.query(
            'SELECT * FROM level_content WHERE roadmap_id = ? AND level_id = ?',
            [req.params.roadmapId, req.params.levelId]
        );
        if (rows.length === 0) return res.json({ exists: false });
        const row = rows[0];
        res.json({ exists: true, ...row, subtopics: parseJson(row.subtopics, []) });
    } catch (err) {
        console.error('[API] Get level content error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/level-content', async (req, res) => {
    try {
        const { roadmap_id, level_id, theory_content, subtopics } = req.body || {};
        if (!roadmap_id || !level_id) return res.status(400).json({ error: 'roadmap_id and level_id required' });
        if (!(await ownsRoadmap(req.user.id, roadmap_id))) return res.status(404).json({ error: 'Roadmap not found' });
        log('LevelContent', `Save: roadmap=${roadmap_id} level=${level_id} theory=${!!theory_content} subtopics=${subtopics?.length || 0}`);

        await pool.query(
            `INSERT INTO level_content (roadmap_id, level_id, theory_content, subtopics, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                theory_content = VALUES(theory_content),
                subtopics = VALUES(subtopics),
                updated_at = CURRENT_TIMESTAMP`,
            [roadmap_id, level_id, theory_content || '', JSON.stringify(Array.isArray(subtopics) ? subtopics : [])]
        );
        const [rows] = await pool.query(
            'SELECT * FROM level_content WHERE roadmap_id = ? AND level_id = ?',
            [roadmap_id, level_id]
        );
        if (rows.length === 0) throw new Error('Failed to retrieve saved level content');
        res.json({ ...rows[0], subtopics: parseJson(rows[0].subtopics, []) });
    } catch (err) {
        // Details stay in the server log; clients get a generic message.
        console.error('[API] Save level content error:', err.message, err.code || '', err.sqlMessage || '');
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/level-quiz/:roadmapId/:levelId', async (req, res) => {
    try {
        if (!(await ownsRoadmap(req.user.id, req.params.roadmapId))) return res.status(404).json({ error: 'Roadmap not found' });
        const [rows] = await pool.query(
            'SELECT * FROM level_quizzes WHERE roadmap_id = ? AND level_id = ?',
            [req.params.roadmapId, req.params.levelId]
        );
        if (rows.length === 0) return res.json({ exists: false });
        const row = rows[0];
        res.json({ exists: true, ...row, questions: parseJson(row.questions, []) });
    } catch (err) {
        console.error('[API] Get level quiz error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/level-quiz', async (req, res) => {
    try {
        const { roadmap_id, level_id, questions } = req.body || {};
        if (!roadmap_id || !level_id) return res.status(400).json({ error: 'roadmap_id and level_id required' });
        if (!(await ownsRoadmap(req.user.id, roadmap_id))) return res.status(404).json({ error: 'Roadmap not found' });
        log('LevelQuiz', `Save: roadmap=${roadmap_id} level=${level_id} questions=${questions?.length || 0}`);

        await pool.query(
            `INSERT INTO level_quizzes (roadmap_id, level_id, questions, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                questions = VALUES(questions),
                updated_at = CURRENT_TIMESTAMP`,
            [roadmap_id, level_id, JSON.stringify(Array.isArray(questions) ? questions : [])]
        );
        const [rows] = await pool.query(
            'SELECT * FROM level_quizzes WHERE roadmap_id = ? AND level_id = ?',
            [roadmap_id, level_id]
        );
        if (rows.length === 0) throw new Error('Failed to retrieve saved level quiz');
        res.json({ ...rows[0], questions: parseJson(rows[0].questions, []) });
    } catch (err) {
        console.error('[API] Save level quiz error:', err.message, err.code || '');
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════
//  CODE EXECUTION (self-hosted Piston)
// ══════════════════════════════════════════
//
// The browser never talks to Piston directly — every execution goes through
// here so validation, rate limiting and logging are enforced server-side.

const executionLimiter = rateLimit({
    windowMs: 60000,
    max: Number(process.env.EXEC_RATE_LIMIT_PER_MIN || 20),
    keyPrefix: 'exec',
});

router.post('/execute', executionLimiter, async (req, res) => {
    try {
        const result = await codeExecution.execute(req.body);
        res.json(result);
    } catch (err) {
        if (err instanceof codeExecution.ExecutionError) {
            return res.status(edgeSafe(err.status)).json({
                error: err.message,
                code: err.code,
                ...(err.field ? { field: err.field } : {}),
            });
        }
        console.error('[API] Execute error:', err);
        res.status(500).json({ error: 'Execution failed', code: 'execution_failed' });
    }
});

// Languages this deployment can actually run (drives the playground picker).
router.get('/execute/languages', async (req, res) => {
    try {
        res.json({ languages: await codeExecution.listSupportedLanguages() });
    } catch (err) {
        res.status(503).json({
            error: 'The code execution service is currently unavailable.',
            code: 'piston_unavailable',
        });
    }
});

// Diagnostic: is Piston reachable, and how many runtimes does it report?
router.get('/health/piston', async (req, res) => {
    const health = await codeExecution.checkPistonHealth();
    res.status(health.healthy ? 200 : 503).json(health);
});


// ── LLM proxy: keeps the provider key server-side ──
const llmLimiter = rateLimit({
    windowMs: 60000,
    max: Number(process.env.LLM_RATE_LIMIT_PER_MIN || 30),
    keyPrefix: 'llm',
});

router.post('/llm/chat', llmLimiter, async (req, res) => {
    try {
        const payload = llmProxy.validateChatRequest(req.body);
        await llmProxy.proxyChat(payload, res);
    } catch (err) {
        if (res.headersSent) return res.end(); // stream already started
        if (err instanceof llmProxy.LlmProxyError) {
            return res.status(edgeSafe(err.status)).json({ error: err.message, code: err.code });
        }
        console.error('[API] LLM proxy error:', err);
        res.status(500).json({ error: 'AI request failed', code: 'llm_failed' });
    }
});

router.get('/llm/status', async (req, res) => {
    res.json({ configured: llmProxy.isConfigured(), models: llmProxy.ALLOWED_MODELS, ...(await llmProxy.probe()) });
});

// ── Web search proxy: keeps the Exa key server-side ──
router.post('/search/web', rateLimit({ windowMs: 60000, max: Number(process.env.SEARCH_RATE_LIMIT_PER_MIN || 20), keyPrefix: 'search' }), async (req, res) => {
    try {
        const results = await searchProxy.search(req.body?.query, req.body?.numResults);
        res.json({ results });
    } catch (err) {
        if (err instanceof searchProxy.SearchProxyError) {
            return res.status(edgeSafe(err.status)).json({ error: err.message, code: err.code });
        }
        console.error('[API] Search proxy error:', err);
        res.status(500).json({ error: 'Search failed', code: 'search_failed' });
    }
});

// Public, so cache the live probe: otherwise anyone could make the server
// hammer the upstream search engines.
let searchStatusCache = { at: 0, body: null };
router.get('/search/status', async (req, res) => {
    if (!searchStatusCache.body || Date.now() - searchStatusCache.at > 60000) {
        searchStatusCache = { at: Date.now(), body: { configured: searchProxy.isConfigured(), ...(await searchProxy.health()) } };
    }
    res.json(searchStatusCache.body);
});

// ── Notes Routes ──
router.use('/notes', notesRoutes);

// ════════════════════════════════════════════
//  404 Handler — logs unknown routes
// ════════════════════════════════════════════
router.use((req, res) => {
    console.error(`[API] 404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});

export default router;
