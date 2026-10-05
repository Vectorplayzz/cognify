/** Where the learner stopped inside each lesson, so the path can resume it. */
const KEY = 'cognify_lesson_steps';

type Map = Record<string, { step: string; at: number }>;

function read(): Map {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

/** stage: 'overview' → 'deep' (sub-modules) → 'quiz' */
export function getLessonStage(roadmapId: string, levelId: string): 'none' | 'overview' | 'deep' | 'quiz' {
    const v = read()[`${roadmapId}:${levelId}`];
    return (v?.step as any) || 'none';
}

export function setLessonStage(roadmapId: string, levelId: string, step: 'overview' | 'deep' | 'quiz') {
    const order = ['none', 'overview', 'deep', 'quiz'];
    const all = read();
    const k = `${roadmapId}:${levelId}`;
    if (order.indexOf(step) <= order.indexOf(all[k]?.step || 'none')) return;
    all[k] = { step, at: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* quota */ }
}
