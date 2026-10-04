/**
 * Progress & Rewards Service
 * Hybrid: localStorage for instant reads + API for persistent DB sync.
 * localStorage acts as a fast cache; PostgreSQL is the source of truth.
 */

import { UserProgress, RoadmapProgress, QuizResult, Reward } from '../types';
import * as api from './apiService';

const PROGRESS_KEY = 'cognify_progress';

// ── Milestone Rewards ──
export const REWARDS: Reward[] = [
    { id: 'first-quiz', name: 'Quiz Rookie', description: 'Complete your first quiz', icon: 'fa-star', xpThreshold: 0 },
    { id: 'xp-500', name: 'Rising Star', description: 'Earn 500 XP', icon: 'fa-fire', xpThreshold: 500 },
    { id: 'xp-1000', name: 'Knowledge Seeker', description: 'Earn 1,000 XP', icon: 'fa-gem', xpThreshold: 1000 },
    { id: 'xp-2500', name: 'AI Apprentice', description: 'Earn 2,500 XP', icon: 'fa-rocket', xpThreshold: 2500 },
    { id: 'xp-5000', name: 'Neural Knight', description: 'Earn 5,000 XP', icon: 'fa-crown', xpThreshold: 5000 },
    { id: 'xp-10000', name: 'AI Oracle', description: 'Earn 10,000 XP', icon: 'fa-brain', xpThreshold: 10000 },
    { id: 'perfect-quiz', name: 'Perfectionist', description: 'Score 100% on a quiz', icon: 'fa-bullseye', xpThreshold: 0 },
    { id: 'three-roadmaps', name: 'Explorer', description: 'Complete 3 different roadmaps', icon: 'fa-compass', xpThreshold: 0 },
];

/** Get the DB user ID (set by Dashboard on login) */
function getDbUserId(): number | null {
    const id = localStorage.getItem('db_user_id');
    return id ? parseInt(id, 10) : null;
}

function getProgress(): UserProgress {
    try {
        const stored = localStorage.getItem(PROGRESS_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Failed to load progress', e);
    }
    return { visitorId: crypto.randomUUID(), roadmaps: [], totalXp: 0, rewards: [] };
}

function saveProgress(progress: UserProgress): void {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/** Sync XP and rewards to the database (fire-and-forget) */
async function syncToDb(progress: UserProgress): Promise<void> {
    const userId = getDbUserId();
    if (!userId) return;
    try {
        await api.updateUserXp(userId, progress.totalXp, progress.rewards);
    } catch (e) {
        console.warn('[Progress] DB sync failed, localStorage is still up to date', e);
    }
}

/** Sync roadmap progress to the database (fire-and-forget) */
async function syncRoadmapProgressToDb(roadmapDbId: number, rp: RoadmapProgress): Promise<void> {
    const userId = getDbUserId();
    if (!userId || !roadmapDbId) return;
    try {
        await api.upsertProgress({
            user_id: userId,
            roadmap_id: roadmapDbId,
            completed_levels: rp.completedLevels,
            quiz_results: rp.quizResults,
        });
    } catch (e) {
        console.warn('[Progress] DB roadmap progress sync failed', e);
    }
}

export const progressService = {
    getProgress,
    getDbUserId,

    getRoadmapProgress(roadmapId: string): RoadmapProgress | undefined {
        const progress = getProgress();
        return progress.roadmaps.find(r => r.roadmapId === roadmapId);
    },

    isLevelCompleted(roadmapId: string, levelId: string): boolean {
        const rp = this.getRoadmapProgress(roadmapId);
        return rp?.completedLevels.includes(levelId) ?? false;
    },

    completeLevel(roadmapId: string, topic: string, levelId: string, xpReward: number, roadmapDbId?: number): UserProgress {
        const progress = getProgress();
        let rp = progress.roadmaps.find(r => r.roadmapId === roadmapId);
        if (!rp) {
            rp = { roadmapId, topic, completedLevels: [], quizResults: [] };
            progress.roadmaps.push(rp);
        }
        if (!rp.completedLevels.includes(levelId)) {
            rp.completedLevels.push(levelId);
            progress.totalXp += xpReward;
        }
        // Check for new rewards
        checkAndAwardRewards(progress);
        saveProgress(progress);

        // Sync to DB (fire-and-forget)
        syncToDb(progress);
        if (roadmapDbId) syncRoadmapProgressToDb(roadmapDbId, rp);

        return progress;
    },

    saveQuizResult(roadmapId: string, topic: string, result: QuizResult, roadmapDbId?: number): UserProgress {
        const progress = getProgress();
        let rp = progress.roadmaps.find(r => r.roadmapId === roadmapId);
        if (!rp) {
            rp = { roadmapId, topic, completedLevels: [], quizResults: [] };
            progress.roadmaps.push(rp);
        }
        // Replace existing result for same level or add new
        const existingIdx = rp.quizResults.findIndex(q => q.levelId === result.levelId);
        if (existingIdx >= 0) {
            rp.quizResults[existingIdx] = result;
        } else {
            rp.quizResults.push(result);
            // Award "first quiz" reward
            if (!progress.rewards.includes('first-quiz')) {
                progress.rewards.push('first-quiz');
            }
        }
        // Perfect score reward
        if (result.score === result.total && !progress.rewards.includes('perfect-quiz')) {
            progress.rewards.push('perfect-quiz');
        }
        checkAndAwardRewards(progress);
        saveProgress(progress);

        // Sync to DB (fire-and-forget)
        syncToDb(progress);
        if (roadmapDbId) syncRoadmapProgressToDb(roadmapDbId, rp);

        return progress;
    },

    getTotalXp(): number {
        return getProgress().totalXp;
    },

    getEarnedRewards(): Reward[] {
        const progress = getProgress();
        return REWARDS.filter(r => progress.rewards.includes(r.id));
    },

    getLevel(): number {
        const xp = getProgress().totalXp;
        return Math.floor(xp / 200) + 1;
    },

    getRank(): string {
        const level = this.getLevel();
        if (level >= 50) return 'AI Oracle';
        if (level >= 25) return 'Neural Knight';
        if (level >= 12) return 'AI Apprentice';
        if (level >= 5) return 'Knowledge Seeker';
        return 'Beginner';
    }
};

function checkAndAwardRewards(progress: UserProgress): void {
    for (const reward of REWARDS) {
        if (progress.rewards.includes(reward.id)) continue;
        // XP-based rewards
        if (reward.xpThreshold > 0 && progress.totalXp >= reward.xpThreshold) {
            progress.rewards.push(reward.id);
        }
        // 3 roadmaps reward
        if (reward.id === 'three-roadmaps') {
            const completedRoadmaps = progress.roadmaps.filter(r => r.completedLevels.length > 0).length;
            if (completedRoadmaps >= 3) {
                progress.rewards.push(reward.id);
            }
        }
    }
}
