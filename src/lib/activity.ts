import { useEffect, useSyncExternalStore } from 'react';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';

/**
 * Today's activity and the recent history, shared by the right rail
 * (streak week, daily quests) and the profile heatmap.
 */
type State = { data: api.ActivityResponse | null; loading: boolean; error: boolean };
let state: State = { data: null, loading: false, error: false };
const listeners = new Set<() => void>();
const set = (n: Partial<State>) => { state = { ...state, ...n }; listeners.forEach((l) => l()); };
let inflight: Promise<void> | null = null;
let lastLoad = 0;

export function refreshActivity(force = false) {
    if (inflight) return inflight;
    if (!force && state.data && Date.now() - lastLoad < 30000) return Promise.resolve();
    set({ loading: true });
    inflight = api.getActivity(371)
        .then((data) => { lastLoad = Date.now(); set({ data, error: false }); })
        .catch(() => set({ error: true }))
        .finally(() => { set({ loading: false }); inflight = null; });
    return inflight;
}

// Activity changes whenever progress syncs (a level completes, a quiz saves).
progressService.subscribe(() => { setTimeout(() => refreshActivity(true), 1500); });

export function useActivity() {
    const s = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
    useEffect(() => { refreshActivity(); }, []);
    return s;
}

// ── Daily goal (XP per day) ──
const GOAL_KEY = 'cognify_daily_goal';
const goalListeners = new Set<() => void>();
export const GOAL_OPTIONS = [
    { xp: 50, label: 'Casual', hint: '1 lesson a day' },
    { xp: 100, label: 'Regular', hint: '1–2 lessons a day' },
    { xp: 200, label: 'Serious', hint: '2–3 lessons a day' },
    { xp: 400, label: 'Intense', hint: '4+ lessons a day' },
];
function readGoal() {
    try { return Number(localStorage.getItem(GOAL_KEY)) || 100; } catch { return 100; }
}
export function setDailyGoal(xp: number) {
    try { localStorage.setItem(GOAL_KEY, String(xp)); } catch { /* storage unavailable */ }
    goalListeners.forEach((l) => l());
}
export function useDailyGoal() {
    return useSyncExternalStore((cb) => { goalListeners.add(cb); return () => { goalListeners.delete(cb); }; }, readGoal, () => 100);
}

export interface Quest { id: string; label: string; value: number; goal: number; emoji: string; to: string; }
export function questsFor(today: api.DayActivity | undefined, goal: number): Quest[] {
    const t = today || { levels: 0, xp: 0, chats: 0, runs: 0, notes: 0 } as api.DayActivity;
    return [
        { id: 'xp', label: `Earn ${goal} XP`, value: t.xp, goal, emoji: '⚡', to: '/learn' },
        { id: 'chat', label: 'Ask the tutor 3 questions', value: t.chats, goal: 3, emoji: '💬', to: '/tutor' },
        { id: 'run', label: 'Run code twice', value: t.runs, goal: 2, emoji: '🧪', to: '/practice' },
    ];
}

/** Last 7 days (oldest first) with whether each had any activity. */
export function weekStrip(days: api.DayActivity[] | undefined) {
    const active = new Set((days || []).filter((d) => d.levels + d.chats + d.runs + d.notes > 0).map((d) => d.date));
    const out: { date: string; label: string; active: boolean; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        out.push({ date: key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), active: active.has(key), isToday: i === 0 });
    }
    return out;
}
