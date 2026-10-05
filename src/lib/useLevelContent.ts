import { useCallback, useEffect, useRef, useState } from 'react';
import { RoadmapLevel, Subtopic, QuizQuestion } from '../types';
import { aiService } from '../services/llamaService';
import * as api from '../services/apiService';

/** Roadmap levels store subtopics as titles or objects depending on source. */
export function normalizeSubtopics(levelId: string, raw: any[]): Subtopic[] {
    return (raw || []).map((s, i) => typeof s === 'string'
        ? { id: `${levelId}-sub${i}`, title: s, description: '', content: '' }
        : { id: s?.id || `${levelId}-sub${i}`, title: s?.title || `Part ${i + 1}`, description: s?.description || '', content: s?.content || '' });
}

/**
 * Loads a level's lesson (overview, sub-modules, quiz) from the database and
 * generates whatever is missing, streaming text as it arrives. Everything
 * generated is saved back, so each piece is written by the AI only once.
 */
export function useLevelContent(level: RoadmapLevel | null, topic: string, roadmapDbId?: number) {
    const [overview, setOverview] = useState('');
    const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
    const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
    const [subContent, setSubContent] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState({ overview: true, subtopics: true, quiz: true });
    const [streaming, setStreaming] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [reloadKey, setReloadKey] = useState(0);
    const saved = useRef<{ theory: string; subtopics: Subtopic[] }>({ theory: '', subtopics: [] });
    const pending = useRef(new Set<string>());

    const persist = useCallback(() => {
        if (!roadmapDbId || !level) return;
        api.saveLevelContent({ roadmap_id: roadmapDbId, level_id: level.id, theory_content: saved.current.theory, subtopics: saved.current.subtopics })
            .catch((e) => console.error('[lesson] save failed', e));
    }, [roadmapDbId, level?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!level) return;
        let cancelled = false;
        setErrors({});
        setOverview(level.theoryContent || '');
        setSubtopics(normalizeSubtopics(level.id, level.subtopics as any[]));
        setQuiz(level.quiz || []);
        setSubContent({});
        pending.current.clear();
        setLoading({ overview: true, subtopics: true, quiz: true });
        saved.current = { theory: level.theoryContent || '', subtopics: [] };

        const genOverview = async () => {
            setStreaming('overview');
            try {
                const content = await aiService.generateLevelContentStream(topic, level.title, level.description, (acc) => { if (!cancelled) setOverview(acc); });
                if (cancelled) return;
                saved.current.theory = content;
                persist();
            } catch (e: any) {
                if (!cancelled) setErrors((x) => ({ ...x, overview: e?.message || 'The lesson could not be written.' }));
            } finally {
                if (!cancelled) { setLoading((l) => ({ ...l, overview: false })); setStreaming((s) => (s === 'overview' ? null : s)); }
            }
        };
        const genSubtopics = async () => {
            try {
                const subs = await aiService.generateSubtopics(topic, level.title, level.description);
                if (cancelled) return;
                const mapped = subs.slice(0, 6).map((s, i) => ({ id: `${level.id}-sub${i}`, title: s.title, description: s.description, content: '' }));
                setSubtopics(mapped);
                saved.current.subtopics = mapped;
                persist();
            } catch (e) {
                console.warn('[lesson] subtopics failed', e);
            } finally {
                if (!cancelled) setLoading((l) => ({ ...l, subtopics: false }));
            }
        };
        const genQuiz = async () => {
            try {
                const qs = await aiService.generateQuiz(topic, level.title);
                if (cancelled) return;
                const mapped: QuizQuestion[] = qs.map((q, i) => ({ id: `${level.id}-q${i}`, ...q }));
                setQuiz(mapped);
                if (roadmapDbId) api.saveLevelQuiz({ roadmap_id: roadmapDbId, level_id: level.id, questions: mapped }).catch(() => {});
            } catch (e: any) {
                if (!cancelled) setErrors((x) => ({ ...x, quiz: e?.message || 'The quiz could not be written.' }));
            } finally {
                if (!cancelled) setLoading((l) => ({ ...l, quiz: false }));
            }
        };

        (async () => {
            let hasTheory = !!level.theoryContent;
            let hasSubs = false;
            let hasQuiz = (level.quiz || []).length > 0;
            if (roadmapDbId) {
                try {
                    const [c, q] = await Promise.all([api.getLevelContent(roadmapDbId, level.id), api.getLevelQuiz(roadmapDbId, level.id)]);
                    if (cancelled) return;
                    if (c?.exists && typeof c.theory_content === 'string' && c.theory_content.trim()) {
                        hasTheory = true; saved.current.theory = c.theory_content; setOverview(c.theory_content);
                    }
                    if (c?.exists && Array.isArray(c.subtopics) && c.subtopics.length) {
                        hasSubs = true;
                        const subs = normalizeSubtopics(level.id, c.subtopics);
                        saved.current.subtopics = subs; setSubtopics(subs);
                    }
                    if (q?.exists && Array.isArray(q.questions) && q.questions.length) { hasQuiz = true; setQuiz(q.questions); }
                } catch (err) {
                    console.error('[lesson] load failed', err);
                }
            }
            if (cancelled) return;
            setLoading({ overview: !hasTheory, subtopics: !hasSubs, quiz: !hasQuiz });
            await Promise.all([hasTheory ? null : genOverview(), hasSubs ? null : genSubtopics(), hasQuiz ? null : genQuiz()]);
        })();
        return () => { cancelled = true; };
    }, [level?.id, roadmapDbId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Make sure a sub-module's text exists, generating it if needed. */
    const ensureSub = useCallback((sub: Subtopic | undefined) => {
        if (!sub || !level || sub.content || subContent[sub.id] || pending.current.has(sub.id)) return;
        pending.current.add(sub.id);
        setStreaming((s) => s ?? sub.id);
        setErrors((x) => { const n = { ...x }; delete n[sub.id]; return n; });
        aiService.generateSubtopicContentStream(topic, level.title, sub.title, sub.description, (acc) => setSubContent((p) => ({ ...p, [sub.id]: acc })))
            .then((content) => {
                const base = saved.current.subtopics.length ? saved.current.subtopics : subtopics;
                saved.current.subtopics = base.map((s) => (s.id === sub.id ? { ...s, content } : s));
                setSubtopics((prev) => prev.map((s) => (s.id === sub.id ? { ...s, content } : s)));
                persist();
            })
            .catch((err) => {
                setErrors((x) => ({ ...x, [sub.id]: err?.message || 'This part could not be written.' }));
                setSubContent((p) => { const n = { ...p }; delete n[sub.id]; return n; });
            })
            .finally(() => { pending.current.delete(sub.id); setStreaming((s) => (s === sub.id ? null : s)); });
    }, [level, topic, subContent, subtopics, persist]);

    const textFor = (sub: Subtopic) => subContent[sub.id] || sub.content || '';
    const isPending = (id: string) => pending.current.has(id);

    return {
        overview, subtopics, quiz, loading, streaming, errors,
        textFor, ensureSub, isPending,
        reload: () => setReloadKey((k) => k + 1),
    };
}
