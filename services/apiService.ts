/**
 * API Service — Frontend client for Cognify backend
 */

/** Base path for Cognify's API. nginx proxies this to the API process. */
export const API_BASE = '/api';

// ── Session ──
// The backend issues its own session token after verifying Google sign-in.
// Every API call carries it; the server derives the user from it and ignores
// any user id sent in a request.

const SESSION_KEY = 'cognify_session';
const SESSION_EXPIRES_KEY = 'cognify_session_expires';

export function getSessionToken(): string | null {
    try {
        const token = localStorage.getItem(SESSION_KEY);
        const expires = localStorage.getItem(SESSION_EXPIRES_KEY);
        if (!token) return null;
        if (expires && Date.parse(expires) <= Date.now()) {
            clearSession();
            return null;
        }
        return token;
    } catch {
        return null;
    }
}

export function hasSession(): boolean {
    return getSessionToken() !== null;
}

// Everything tied to the signed-in account. Progress and roadmap caches are
// per-user data too: leaving them would hand one user's XP to whoever signs
// in next on the same browser.
const ACCOUNT_KEYS = [
    SESSION_KEY, SESSION_EXPIRES_KEY, 'db_user_id', 'user', 'user_name', 'user_picture', 'token',
    'cognify_progress', 'cognify_roadmaps',
];

export function clearSession() {
    for (const key of ACCOUNT_KEYS) {
        try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    }
}

/** Headers for any request to the Cognify API. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = getSessionToken();
    return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

/**
 * Call on any 401 from the API: the session is gone or invalid, so drop it
 * and return to the sign-in page rather than failing silently.
 */
export function handleUnauthorized(res: Response) {
    if (res.status !== 401) return;
    clearSession();
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.assign('/');
    }
}

/** Exchange a Google access token for a Cognify session. */
export async function signInWithGoogle(accessToken: string): Promise<{ user: any; token: string; expiresAt: string }> {
    const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.token) {
        throw new Error(body?.error || `Sign-in failed (HTTP ${res.status})`);
    }
    localStorage.setItem(SESSION_KEY, body.token);
    localStorage.setItem(SESSION_EXPIRES_KEY, body.expiresAt);
    localStorage.setItem('db_user_id', String(body.user.id));
    return body;
}

async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    // Defensive: catch missing IDs early
    if (/\/(undefined|null|NaN)(\/|\?|$)/.test(path)) {
        const err = new Error(`API call with undefined/null path segment: ${path}`);
        console.error('[API] ❌', err.message);
        throw err;
    }
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: authHeaders({ 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) }),
    });
    if (!res.ok) {
        handleUnauthorized(res);
        const body = await res.text();
        console.error(`[API] ${res.status} on ${path}:`, body);
        throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json();
}

// ── Users ──
/** The signed-in user's account record. */
export async function getCurrentUser() { return apiFetch('/auth/me'); }
export async function getUser(googleId: string) { return apiFetch(`/users/${googleId}`); }
export async function updateUserXp(userId: number, xp: number, rewards: string[]) {
    return apiFetch(`/users/${userId}/xp`, { method: 'PUT', body: JSON.stringify({ xp, rewards }) });
}

// ── Leaderboard ──
export interface LeaderboardEntry {
    id: number; rank: number; name: string; picture?: string | null;
    xp: number; level: number; streak: number; isMe: boolean;
}
export interface LeaderboardResponse {
    leaders: LeaderboardEntry[];
    me: { rank: number; xp: number; level: number; streak: number } | null;
    total: number;
}
export async function getLeaderboard(limit = 50): Promise<LeaderboardResponse> {
    return apiFetch(`/leaderboard?limit=${limit}`);
}

// ── Roadmaps ──
/**
 * Resolve a topic to a roadmap. The backend decides the source
 * (roadmap.sh first, AI fallback) — callers get the same shape either way.
 */
export async function resolveRoadmap(topic: string): Promise<{
    success: boolean;
    source: 'roadmap.sh' | 'ai';
    resolution?: { slug?: string; matchedBy?: string; confidence?: number; title?: string };
    roadmap: {
        source: string; sourceSlug?: string; sourceUrl?: string; sourceProvider?: string;
        title: string; description: string; levels: any[];
    };
}> {
    const res = await fetch(`${API_BASE}/roadmaps/resolve?topic=${encodeURIComponent(topic)}`, { headers: authHeaders() });
    handleUnauthorized(res);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
        throw new Error(body?.error || `Could not build a roadmap for "${topic}".`);
    }
    return body;
}

export async function createRoadmap(data: { user_id?: number | null; client_id?: string; topic: string; levels: any[]; source?: { source?: string; sourceSlug?: string; sourceUrl?: string; sourceProvider?: string } | null }) {
    return apiFetch('/roadmaps', { method: 'POST', body: JSON.stringify(data) });
}
export async function getUserRoadmaps(userId: number) { 
    const result = await apiFetch<any[]>(`/roadmaps/user/${userId}`);
    // Ensure levels are properly parsed (MySQL returns JSON as string)
    return result.map(r => ({
        ...r,
        levels: Array.isArray(r.levels) ? r.levels : (typeof r.levels === 'string' ? JSON.parse(r.levels) : [])
    }));
}
export async function getRoadmapById(id: number) { 
    const result = await apiFetch<any>(`/roadmaps/${id}`);
    // Ensure levels are properly parsed (MySQL returns JSON as string)
    return {
        ...result,
        levels: Array.isArray(result.levels) ? result.levels : (typeof result.levels === 'string' ? JSON.parse(result.levels) : [])
    };
}
export async function deleteRoadmap(id: number) { return apiFetch(`/roadmaps/${id}`, { method: 'DELETE' }); }

// ── Progress ──
export async function upsertProgress(data: { user_id: number; roadmap_id: number; completed_levels: string[]; quiz_results: any[] }) {
    return apiFetch('/progress', { method: 'PUT', body: JSON.stringify(data) });
}
export async function getProgress(userId: number, roadmapId: number) { return apiFetch(`/progress/${userId}/${roadmapId}`); }
export async function getAllProgress(userId: number) { return apiFetch(`/progress/${userId}`); }

// ── Chat Sessions ──
export async function createChatSession(userId: number, title?: string) {
    return apiFetch('/chat/sessions', { method: 'POST', body: JSON.stringify({ user_id: userId, title }) });
}
export async function listChatSessions(userId: number) {
    return apiFetch(`/chat/sessions/${userId}`);
}
export async function updateChatSession(sessionId: number, title: string) {
    return apiFetch(`/chat/sessions/${sessionId}`, { method: 'PUT', body: JSON.stringify({ title }) });
}
export async function deleteChatSession(sessionId: number) {
    return apiFetch(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
}

// ── Chat Messages (session-based) ──
export async function saveMessage(data: { user_id: number; session_id: number; role: string; content: string }) {
    return apiFetch('/chat/messages', { method: 'POST', body: JSON.stringify(data) });
}
export async function getSessionMessages(sessionId: number) {
    return apiFetch(`/chat/messages/${sessionId}`);
}
export async function clearAllChat(userId: number) {
    return apiFetch(`/chat/${userId}`, { method: 'DELETE' });
}

// ── Code History ──
export async function saveCodeRun(data: { user_id: number; language: string; code: string; stdin?: string; output?: string }) {
    return apiFetch('/code-history', { method: 'POST', body: JSON.stringify(data) });
}
export async function getCodeHistory(userId: number, limit = 20) { return apiFetch(`/code-history/${userId}?limit=${limit}`); }

// ── Group Chat Rooms ──
export async function createRoom(data: { user_id: number; name: string }) {
    return apiFetch('/rooms', { method: 'POST', body: JSON.stringify(data) });
}
export async function joinRoom(data: { user_id: number; invite_code: string }) {
    return apiFetch('/rooms/join', { method: 'POST', body: JSON.stringify(data) });
}
export async function regenerateInviteCode(roomId: number) {
    return apiFetch(`/rooms/${roomId}/regenerate-code`, { method: 'POST' });
}
export async function getUserRooms(userId: number) { return apiFetch(`/rooms/user/${userId}`); }
export async function getRoomDetails(roomId: number) { return apiFetch(`/rooms/${roomId}`); }
export async function getRoomMessages(roomId: number, afterId?: number) {
    const query = afterId ? `?after=${afterId}` : '';
    return apiFetch(`/rooms/${roomId}/messages${query}`);
}
export async function postRoomMessage(roomId: number, data: {
    user_id?: number; sender_name: string; content: string; role?: string; persona?: string;
}) {
    return apiFetch(`/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify(data) });
}

// ── Level Content & Quizzes (Static Course Data) ──
export async function checkRoadmapExists(userId: number, topic: string) {
    const result = await apiFetch<{ exists: boolean; roadmap?: any }>(`/roadmaps/check?user_id=${userId}&topic=${encodeURIComponent(topic)}`);
    if (result.exists && result.roadmap) {
        // Ensure levels are properly parsed (MySQL returns JSON as string)
        result.roadmap.levels = Array.isArray(result.roadmap.levels) 
            ? result.roadmap.levels 
            : (typeof result.roadmap.levels === 'string' ? JSON.parse(result.roadmap.levels) : []);
    }
    return result;
}
export async function getLevelContent(roadmapId: number, levelId: string) {
    return apiFetch(`/level-content/${roadmapId}/${encodeURIComponent(levelId)}`);
}
export async function saveLevelContent(data: { roadmap_id: number; level_id: string; theory_content?: string; subtopics?: any[] }) {
    return apiFetch('/level-content', { method: 'PUT', body: JSON.stringify(data) });
}
export async function getLevelQuiz(roadmapId: number, levelId: string) {
    return apiFetch(`/level-quiz/${roadmapId}/${encodeURIComponent(levelId)}`);
}
export async function saveLevelQuiz(data: { roadmap_id: number; level_id: string; questions?: any[] }) {
    return apiFetch('/level-quiz', { method: 'PUT', body: JSON.stringify(data) });
}

// ── Notes (RAG) ──
export async function createNoteSource(data: {
    noteId: number | null;
    type: 'text' | 'file' | 'url' | 'roadmap' | 'level';
    title: string;
    content: string;
    userId?: number | null;
    metadata?: Record<string, any>;
}) {
    return apiFetch('/notes/sources', { method: 'POST', body: JSON.stringify(data) });
}

export async function getNoteSources(noteId: number) {
    return apiFetch(`/notes/notes/${noteId}/sources`);
}

export async function createNote(data: {
    userId: number;
    title: string;
    type: 'summary' | 'study_guide' | 'exam_prep' | 'flashcards';
    content?: string;
    sourceIds?: number[];
}) {
    return apiFetch('/notes/notes', { method: 'POST', body: JSON.stringify(data) });
}

export async function getUserNotes(userId: number) {
    return apiFetch(`/notes/users/${userId}/notes`);
}

export async function getNote(id: number) {
    return apiFetch(`/notes/notes/${id}`);
}

export async function updateNote(id: number, data: {
    title?: string;
    content?: string;
    summary?: string;
    keyPoints?: string[];
}) {
    return apiFetch(`/notes/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteNote(id: number) {
    return apiFetch(`/notes/notes/${id}`, { method: 'DELETE' });
}
