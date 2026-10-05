import { useSyncExternalStore } from 'react';

export interface Profile {
    sub?: string;
    name: string;
    email: string;
    picture?: string;
}

const listeners = new Set<() => void>();
let cached: { raw: string | null; value: Profile | null } = { raw: null, value: null };

function read(): Profile | null {
    let raw: string | null = null;
    try { raw = localStorage.getItem('user'); } catch { /* storage unavailable */ }
    if (raw === cached.raw) return cached.value;
    let value: Profile | null = null;
    try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
    cached = { raw, value };
    return value;
}

export function saveProfile(profile: Profile) {
    try {
        localStorage.setItem('user', JSON.stringify(profile));
        localStorage.setItem('user_name', profile.name || '');
        localStorage.setItem('user_picture', profile.picture || '');
    } catch { /* storage unavailable */ }
    listeners.forEach((l) => l());
}

/** The signed-in learner's Google profile (name, email, picture). */
export function useProfile(): Profile | null {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
        read,
        () => null,
    );
}
