/**
 * XP, streaks and the leaderboard.
 *
 * XP is owned by the server. Each completed level is recorded once in
 * xp_ledger, keyed by (user, topic, level) — so the reward is checked
 * against the stored roadmap, cannot be claimed twice by re-creating a
 * roadmap, and survives deleting a roadmap. users.xp is a cache of the
 * ledger sum.
 *
 * A streak counts consecutive days with learning activity (completing
 * progress, chatting with the tutor, running code, making notes).
 */
import pool from '../db.js';

const MAX_LEVEL_XP = 1000;
const LEGACY_KEY = '__legacy__';

function parseJson(value, fallback) {
    if (typeof value !== 'string') return value ?? fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

export function topicKey(topic) {
    return String(topic || '').trim().toLowerCase().slice(0, 255);
}

/** Bump the daily streak (idempotent within a day). */
export async function recordActivity(userId) {
    await pool.query(
        `UPDATE users SET
            streak = CASE
                WHEN last_active_date = CURDATE() THEN streak
                WHEN last_active_date = CURDATE() - INTERVAL 1 DAY THEN streak + 1
                ELSE 1 END,
            last_active_date = CURDATE()
         WHERE id = ?`,
        [userId]
    );
}

/** Fire-and-forget variant for routes where the streak is incidental. */
export function touchActivity(userId) {
    recordActivity(userId).catch((err) => console.warn('[Streak] update failed:', err.message));
}

/** The user row with a streak that reads 0 once a day has been missed. */
export async function getUser(userId) {
    const [rows] = await pool.query(
        `SELECT u.*, (u.last_active_date >= CURDATE() - INTERVAL 1 DAY) AS streak_alive
         FROM users u WHERE u.id = ?`,
        [userId]
    );
    if (!rows.length) return null;
    const { streak_alive, ...user } = rows[0];
    return { ...user, streak: Number(streak_alive) ? user.streak : 0, rewards: parseJson(user.rewards, []) };
}

/**
 * Award XP for the levels of a roadmap the user has completed. Only level
 * ids present in the stored roadmap count, each at its stored reward.
 */
export async function awardCompletedLevels(userId, roadmapId, completedLevels) {
    const [rows] = await pool.query('SELECT topic, levels FROM roadmaps WHERE id = ? AND user_id = ?', [roadmapId, userId]);
    if (!rows.length) return;
    const levels = parseJson(rows[0].levels, []);
    const done = new Set((Array.isArray(completedLevels) ? completedLevels : []).map(String));
    const key = topicKey(rows[0].topic);
    const values = [];
    for (const level of Array.isArray(levels) ? levels : []) {
        if (!level || !done.has(String(level.id))) continue;
        const xp = Math.max(0, Math.min(MAX_LEVEL_XP, Math.round(Number(level.xpReward) || 0)));
        values.push([userId, key, String(level.id).slice(0, 255), xp]);
    }
    if (values.length) {
        await pool.query('INSERT IGNORE INTO xp_ledger (user_id, topic_key, level_id, xp) VALUES ?', [values]);
    }
    await refreshXp(userId);
}

export async function refreshXp(userId) {
    await pool.query(
        'UPDATE users SET xp = (SELECT COALESCE(SUM(xp), 0) FROM xp_ledger WHERE user_id = ?) WHERE id = ?',
        [userId, userId]
    );
}

/** Short public display name: "Ada Lovelace" → "Ada L." */
function publicName(name) {
    const parts = String(name || 'Learner').trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export async function leaderboard(userId, limit = 50) {
    const lim = Math.max(1, Math.min(100, Number(limit) || 50));
    const [rows] = await pool.query(
        `SELECT id, name, picture, xp,
                CASE WHEN last_active_date >= CURDATE() - INTERVAL 1 DAY THEN streak ELSE 0 END AS streak
         FROM users WHERE xp > 0
         ORDER BY xp DESC, id ASC LIMIT ?`,
        [lim]
    );
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM users WHERE xp > 0');
    const me = await getUser(userId);
    let meRank = null;
    if (me) {
        const [[{ ahead }]] = await pool.query(
            'SELECT COUNT(*) AS ahead FROM users WHERE xp > ? OR (xp = ? AND id < ?)',
            [me.xp, me.xp, me.id]
        );
        meRank = Number(ahead) + 1;
    }
    return {
        leaders: rows.map((r, i) => ({
            id: r.id,
            rank: i + 1,
            name: r.id === userId ? r.name : publicName(r.name),
            picture: r.picture || null,
            xp: Number(r.xp) || 0,
            level: Math.floor((Number(r.xp) || 0) / 200) + 1,
            streak: Number(r.streak) || 0,
            isMe: r.id === userId,
        })),
        me: me ? { rank: meRank, xp: Number(me.xp) || 0, level: Math.floor((Number(me.xp) || 0) / 200) + 1, streak: me.streak } : null,
        total: Number(total) || 0,
    };
}

/**
 * One-time backfill when the ledger is first created: record every level
 * already completed, and keep any XP earned under the old client-reported
 * scheme as a single legacy entry, so nobody's total drops.
 */
export async function backfillLedger(connection) {
    const [users] = await connection.query('SELECT id, xp FROM users');
    for (const u of users) {
        const [progress] = await connection.query(
            `SELECT p.completed_levels, r.topic, r.levels FROM user_progress p
             JOIN roadmaps r ON r.id = p.roadmap_id WHERE p.user_id = ?`,
            [u.id]
        );
        const values = [];
        for (const p of progress) {
            const done = new Set(parseJson(p.completed_levels, []).map(String));
            for (const level of parseJson(p.levels, [])) {
                if (level && done.has(String(level.id))) {
                    values.push([u.id, topicKey(p.topic), String(level.id).slice(0, 255),
                        Math.max(0, Math.min(MAX_LEVEL_XP, Math.round(Number(level.xpReward) || 0)))]);
                }
            }
        }
        if (values.length) await connection.query('INSERT IGNORE INTO xp_ledger (user_id, topic_key, level_id, xp) VALUES ?', [values]);
        const [[{ earned }]] = await connection.query('SELECT COALESCE(SUM(xp), 0) AS earned FROM xp_ledger WHERE user_id = ?', [u.id]);
        const legacy = Math.max(0, (Number(u.xp) || 0) - Number(earned));
        if (legacy > 0) {
            await connection.query(
                'INSERT IGNORE INTO xp_ledger (user_id, topic_key, level_id, xp) VALUES (?, ?, ?, ?)',
                [u.id, LEGACY_KEY, LEGACY_KEY, legacy]
            );
        }
    }
}
