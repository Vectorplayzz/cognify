/**
 * Shared store for the learner's saved roadmaps, so Home and Roadmaps read
 * the same list and a change in one is visible in the other.
 */
import { useSyncExternalStore } from 'react';
import { GeneratedRoadmap } from '../types';
import * as api from './apiService';
import { progressService } from './progressService';

const CACHE_KEY = 'cognify_roadmaps';

function readCache(): GeneratedRoadmap[] {
    try {
        const s = localStorage.getItem(CACHE_KEY);
        const v = s ? JSON.parse(s) : [];
        return Array.isArray(v) ? v : [];
    } catch { return []; }
}

let state: { roadmaps: GeneratedRoadmap[]; loading: boolean; loaded: boolean } = {
    roadmaps: readCache(),
    loading: false,
    loaded: false,
};
const listeners = new Set<() => void>();

function set(next: Partial<typeof state>) {
    state = { ...state, ...next };
    if (next.roadmaps) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next.roadmaps)); } catch { /* quota */ }
    }
    listeners.forEach((l) => l());
}

export function toRoadmap(r: any): GeneratedRoadmap {
    return {
        id: String(r.id),
        topic: r.topic,
        levels: Array.isArray(r.levels) ? r.levels : (typeof r.levels === 'string' ? safeParse(r.levels) : []),
        createdAt: r.created_at || new Date().toISOString(),
        dbId: r.id,
        source: (typeof r.source === 'string' ? safeParse(r.source) : r.source) || null,
    };
}

function safeParse(s: string) {
    try { return JSON.parse(s); } catch { return []; }
}

let inflight: Promise<void> | null = null;

export const roadmapStore = {
    get: () => state,

    subscribe(l: () => void) {
        listeners.add(l);
        return () => { listeners.delete(l); };
    },

    /** Load roadmaps and their progress from the server (deduplicated). */
    load(force = false): Promise<void> {
        if (inflight) return inflight;
        if (state.loaded && !force) return Promise.resolve();
        const userId = progressService.getDbUserId();
        if (!userId) {
            set({ loaded: true });
            return Promise.resolve();
        }
        set({ loading: true });
        inflight = (async () => {
            try {
                const saved = await api.getUserRoadmaps(userId);
                const roadmaps = saved.map(toRoadmap);
                set({ roadmaps });
                try {
                    const rows = await api.getAllProgress(userId);
                    progressService.mergeServerProgress(rows || [], roadmaps);
                } catch (err) {
                    console.warn('[Roadmaps] progress load failed', err);
                }
            } catch (err) {
                console.error('[Roadmaps] load failed', err);
            } finally {
                set({ loading: false, loaded: true });
                inflight = null;
            }
        })();
        return inflight;
    },

    upsert(roadmap: GeneratedRoadmap) {
        set({ roadmaps: [roadmap, ...state.roadmaps.filter((r) => r.id !== roadmap.id)] });
    },

    remove(id: string) {
        set({ roadmaps: state.roadmaps.filter((r) => r.id !== id) });
        progressService.forgetRoadmap(id);
    },

    reset() {
        state = { roadmaps: [], loading: false, loaded: false };
    },
};

export function useRoadmaps() {
    return useSyncExternalStore(roadmapStore.subscribe, roadmapStore.get, roadmapStore.get);
}
