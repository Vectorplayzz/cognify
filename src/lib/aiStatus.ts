import { useEffect, useSyncExternalStore } from 'react';

/** Whether the AI backend is currently answering (from /api/llm/status). */
let state: { available: boolean | null } = { available: null };
const listeners = new Set<() => void>();
let started = false;

async function check() {
    try {
        const r = await fetch('/api/llm/status');
        const d = await r.json();
        state = { available: !!d.available };
    } catch {
        state = { available: null };
    }
    listeners.forEach((l) => l());
}

export function useAiStatus() {
    const s = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
    useEffect(() => {
        if (started) return;
        started = true;
        check();
        const t = setInterval(check, 5 * 60 * 1000);
        return () => { clearInterval(t); started = false; };
    }, []);
    return s.available;
}
