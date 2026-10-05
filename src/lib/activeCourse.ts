import { useSyncExternalStore } from 'react';

const KEY = 'cognify_active_course';
const listeners = new Set<() => void>();

function read(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setActiveCourse(id: string | null) {
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    listeners.forEach((l) => l());
}
/** The roadmap shown on the Learn path (falls back to the newest one). */
export function useActiveCourseId() {
    return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, read, () => null);
}
