/**
 * Progress & Rewards Service
 *
 * localStorage is a fast cache so the UI can render instantly; the server is
 * the source of truth. XP is awarded by the server (it validates each
 * completed level against the stored roadmap), so after every sync the cache
 * adopts the server's totals. Components subscribe through useProgress().
 */

import { useSyncExternalStore } from 'react';
import { UserProgress, RoadmapProgress, QuizResult, Reward } from '../types';
import * as api from './apiService';

const PROGRESS_KEY = 'cognify_progress';
const PROFILE_KEY = 'cognify_profile_stats';

// ── Milestone Rewards ──
export const REWARDS: Reward[] = [
    { id: 'first-quiz', name: 'Quiz Rookie', description: 'Complete your first quiz', icon: 'star', xpThreshold: 0 },
    { id: 'xp-500', name: 'Rising Star', description: 'Earn 500 XP', icon: 'flame', xpThreshold: 500 },
    { id: 'xp-1000', name: 'Knowledge Seeker', description: 'Earn 1,000 XP', icon: 'gem', xpThreshold: 1000 },
    { id: 'xp-2500', name: 'AI Apprentice', description: 'Earn 2,500 XP', icon: 'rocket', xpThreshold: 2500 },
    { id: 'xp-5000', name: 'Neural Knight', description: 'Earn 5,000 XP', icon: 'crown', xpThreshold: 5000 },
    { id: 'xp-10000', name: 'AI Oracle', description: 'Earn 10,000 XP', icon: 'brain', xpThreshold: 10000 },
    { id: 'perfect-quiz', name: 'Perfectionist', description: 'Score 100% on a quiz', icon: 'target', xpThreshold: 0 },
    { id: 'three-roadmaps', name: 'Explorer', description: 'Make progress on 3 roadmaps', icon: 'compass', xpThreshold: 0 },
];

export const XP_PER_LEVEL = 200;

export function levelForXp(xp: number) {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function rankForLevel(level: number): string {
    if (level >= 50) return 'AI Oracle';
    if (level >= 25) return 'Neural Knight';
    if (level >= 12) return 'AI Apprentice';
    if (level >= 5) return 'Knowledge Seeker';
    return 'Beginner';
}

// ── Store plumbing ──
const listeners = new Set<() => void>();
let version = 0;
function notify() {
    version++;
    listeners.forEach((l) => l());
}

function getDbUserId(): number | null {
    const id = localStorage.getItem('db_user_id');
    const n = id ? parseInt(id, 10) : NaN;
    return Number.isFinite(n) ? n : null;
}

function emptyProgress(): UserProgress {
    return { visitorId: crypto.randomUUID(), roadmaps: [], totalXp: 0, rewards: [] };
}

function getProgress(): UserProgress {
    try {
        const stored = localStorage.getItem(PROGRESS_KEY);
        if (stored) {
            const p = JSON.parse(stored);
            if (p && Array.isArray(p.roadmaps)) return p;
        }
    } catch (e) {
        console.error('Failed to load progress', e);
    }
    return emptyProgress();
}

function saveProgress(progress: UserProgress): void {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* quota */ }
    notify();
}

interface ProfileStats { streak: number; }
function getProfileStats(): ProfileStats {
    try {
        const s = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
        return { streak: Number(s.streak) || 0 };
    } catch { return { streak: 0 }; }
}

/** Adopt the server's view of XP, rewards and streak. */
function applyServerUser(user: any) {
    if (!user || typeof user !== 'object') return;
    const progress = getProgress();
    if (Number.isFinite(Number(user.xp))) progress.totalXp = Number(user.xp);
    const serverRewards: string[] = Array.isArray(user.rewards)
        ? user.rewards
        : (typeof user.rewards === 'string' ? safeJson(user.rewards, []) : []);
    progress.rewards = Array.from(new Set([...(progress.rewards || []), ...serverRewards]));
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ streak: Number(user.streak) || 0 })); } catch { /* quota */ }
    saveProgress(progress);
}

function safeJson<T>(s: string, fallback: T): T {
    try { return JSON.parse(s); } catch { return fallback; }
}

/** Push earned rewards to the server (XP itself is computed server-side). */
async function syncRewards(progress: UserProgress): Promise<void> {
    const userId = getDbUserId();
    if (!userId) return;
    try {
        const user = await api.updateUserXp(userId, progress.totalXp, progress.rewards);
        applyServerUser(user);
    } catch (e) {
        console.warn('[Progress] reward sync failed; local cache is still up to date', e);
    }
}

async function syncRoadmapProgressToDb(roadmapDbId: number, rp: RoadmapProgress): Promise<void> {
    const userId = getDbUserId();
    if (!userId || !roadmapDbId) return;
    try {
        const res: any = await api.upsertProgress({
            user_id: userId,
            roadmap_id: roadmapDbId,
            completed_levels: rp.completedLevels,
            quiz_results: rp.quizResults,
        });
        if (res?.user) applyServerUser(res.user);
    } catch (e) {
        console.warn('[Progress] roadmap progress sync failed', e);
    }
}

function ensureRoadmap(progress: UserProgress, roadmapId: string, topic: string): RoadmapProgress {
    let rp = progress.roadmaps.find((r) => r.roadmapId === roadmapId);
    if (!rp) {
        rp = { roadmapId, topic, completedLevels: [], quizResults: [] };
        progress.roadmaps.push(rp);
    }
    return rp;
}

function checkAndAwardRewards(progress: UserProgress): void {
    for (const reward of REWARDS) {
        if (progress.rewards.includes(reward.id)) continue;
        if (reward.xpThreshold > 0 && progress.totalXp >= reward.xpThreshold) {
            progress.rewards.push(reward.id);
        }
        if (reward.id === 'three-roadmaps') {
            const started = progress.roadmaps.filter((r) => r.completedLevels.length > 0).length;
            if (started >= 3) progress.rewards.push(reward.id);
        }
    }
}

export const progressService = {
    getProgress,
    getDbUserId,
    applyServerUser,

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },

    /** Merge per-roadmap progress loaded from the server into the cache. */
    mergeServerProgress(rows: any[], roadmaps: { id: string; topic: string }[]) {
        if (!Array.isArray(rows) || rows.length === 0) return;
        const progress = getProgress();
        for (const row of rows) {
            const roadmapId = String(row.roadmap_id);
            const match = roadmaps.find((r) => r.id === roadmapId);
            if (!match) continue;
            const completed: string[] = Array.isArray(row.completed_levels) ? row.completed_levels : safeJson(row.completed_levels || '[]', []);
            const quizzes: QuizResult[] = Array.isArray(row.quiz_results) ? row.quiz_results : safeJson(row.quiz_results || '[]', []);
            const rp = ensureRoadmap(progress, roadmapId, match.topic);
            rp.completedLevels = Array.from(new Set([...rp.completedLevels, ...completed]));
            const byLevel = new Map(rp.quizResults.map((q) => [q.levelId, q]));
            for (const q of quizzes) if (q?.levelId && !byLevel.has(q.levelId)) byLevel.set(q.levelId, q);
            rp.quizResults = Array.from(byLevel.values());
        }
        saveProgress(progress);
    },

    /** Drop cached progress for a deleted roadmap. */
    forgetRoadmap(roadmapId: string) {
        const progress = getProgress();
        progress.roadmaps = progress.roadmaps.filter((r) => r.roadmapId !== roadmapId);
        saveProgress(progress);
    },

    getRoadmapProgress(roadmapId: string): RoadmapProgress | undefined {
        return getProgress().roadmaps.find((r) => r.roadmapId === roadmapId);
    },

    isLevelCompleted(roadmapId: string, levelId: string): boolean {
        return this.getRoadmapProgress(roadmapId)?.completedLevels.includes(levelId) ?? false;
    },

    completeLevel(roadmapId: string, topic: string, levelId: string, xpReward: number, roadmapDbId?: number): UserProgress {
        const progress = getProgress();
        const rp = ensureRoadmap(progress, roadmapId, topic);
        if (!rp.completedLevels.includes(levelId)) {
            rp.completedLevels.push(levelId);
            // Optimistic; the server's figure replaces this on sync.
            progress.totalXp += xpReward;
        }
        checkAndAwardRewards(progress);
        saveProgress(progress);
        if (roadmapDbId) syncRoadmapProgressToDb(roadmapDbId, rp).then(() => syncRewards(getProgress()));
        else syncRewards(progress);
        return progress;
    },

    saveQuizResult(roadmapId: string, topic: string, result: QuizResult, roadmapDbId?: number): UserProgress {
        const progress = getProgress();
        const rp = ensureRoadmap(progress, roadmapId, topic);
        const existingIdx = rp.quizResults.findIndex((q) => q.levelId === result.levelId);
        if (existingIdx >= 0) {
            // Keep the best attempt.
            if (result.score >= rp.quizResults[existingIdx].score) rp.quizResults[existingIdx] = result;
        } else {
            rp.quizResults.push(result);
        }
        if (!progress.rewards.includes('first-quiz')) progress.rewards.push('first-quiz');
        if (result.total > 0 && result.score === result.total && !progress.rewards.includes('perfect-quiz')) {
            progress.rewards.push('perfect-quiz');
        }
        checkAndAwardRewards(progress);
        saveProgress(progress);
        if (roadmapDbId) syncRoadmapProgressToDb(roadmapDbId, rp);
        return progress;
    },

    getTotalXp(): number {
        return getProgress().totalXp;
    },

    getEarnedRewards(): Reward[] {
        const progress = getProgress();
        return REWARDS.filter((r) => progress.rewards.includes(r.id));
    },

    getLevel(): number {
        return levelForXp(getProgress().totalXp);
    },

    getRank(): string {
        return rankForLevel(this.getLevel());
    },

    getStreak(): number {
        return getProfileStats().streak;
    },
};

/** Live snapshot of the learner's progress for React components. */
export function useProgress() {
    useSyncExternalStore(progressService.subscribe, () => version, () => version);
    const progress = getProgress();
    const xp = progress.totalXp;
    const level = levelForXp(xp);
    return {
        progress,
        xp,
        level,
        rank: rankForLevel(level),
        streak: getProfileStats().streak,
        levelProgress: ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100,
        xpToNext: XP_PER_LEVEL - (xp % XP_PER_LEVEL),
        earned: REWARDS.filter((r) => progress.rewards.includes(r.id)),
    };
}
