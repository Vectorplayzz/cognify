import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'cognify_theme';

function current(): Theme {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

const listeners = new Set<() => void>();

export function setTheme(theme: Theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
    listeners.forEach((l) => l());
}

export function useTheme() {
    const theme = useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
        current,
        () => 'dark' as Theme,
    );
    const toggle = useCallback(() => setTheme(current() === 'dark' ? 'light' : 'dark'), []);
    return { theme, toggle, setTheme };
}
