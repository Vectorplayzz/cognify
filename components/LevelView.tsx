import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
    ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, Home, PartyPopper, RefreshCw, Sparkles, Zap,
} from 'lucide-react';
import { RoadmapLevel, Subtopic, QuizQuestion, QuizResult } from '../types';
import { aiService } from '../services/llamaService';
import { progressService, useProgress } from '../services/progressService';
import QuizView from './QuizView';
import * as api from '../services/apiService';
import { Badge, Button, Card, Modal, Segmented } from './ui';
import Markdown from './ui/Markdown';
import { cn } from '../lib/cn';

interface LevelViewProps {
    level: RoadmapLevel;
    levelNumber: number;
    totalLevels: number;
    topic: string;
    roadmapId: string;
    roadmapDbId?: number;
    onBack: () => void;
    onNext: () => void;
    isLastLevel: boolean;
}

/** Roadmap levels store subtopics as titles or objects depending on source. */
function normalizeSubtopics(levelId: string, raw: any[]): Subtopic[] {
    return (raw || []).map((s, i) => typeof s === 'string'
        ? { id: `${levelId}-sub${i}`, title: s, description: '', content: '' }
        : { id: s.id || `${levelId}-sub${i}`, title: s.title || `Part ${i + 1}`, description: s.description || '', content: s.content || '' });
}

const LoadingBlock: React.FC<{ label: string }> = ({ label }) => (
    <div className="space-y-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted">
            <Sparkles className="size-4 animate-pulse text-brand-400" /> {label}
        </div>
        <div className="skeleton h-7 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton mt-6 h-32 w-full" />
    </div>
);

const LevelView: React.FC<LevelViewProps> = ({
    level, levelNumber, totalLevels, topic, roadmapId, roadmapDbId, onBack, onNext, isLastLevel,
}) => {
    const { progress } = useProgress();
    const [subtopics, setSubtopics] = useState<Subtopic[]>(() => normalizeSubtopics(level.id, level.subtopics as any[]));
    const [activeIdx, setActiveIdx] = useState(-1);
    const [subtopicContent, setSubtopicContent] = useState<Record<string, string>>({});
    const [loadingSubtopics, setLoadingSubtopics] = useState(true);
    const [overview, setOverview] = useState(level.theoryContent || '');
    const [loadingOverview, setLoadingOverview] = useState(!level.theoryContent);
    const [streamingId, setStreamingId] = useState<string | null>(null);
    const [quiz, setQuiz] = useState<QuizQuestion[]>(level.quiz || []);
    const [loadingQuiz, setLoadingQuiz] = useState(!(level.quiz || []).length);
    const [tab, setTab] = useState<'learn' | 'quiz'>('learn');
    const [celebrate, setCelebrate] = useState<{ xp: number; score: number; total: number } | null>(null);
    const [errors, setErrors] = useState<{ overview?: string; quiz?: string; sub?: string }>({});
    const [reloadKey, setReloadKey] = useState(0);
    const contentTop = useRef<HTMLDivElement>(null);

    // Latest persisted values, so each save writes both fields and never
    // blanks the other one (the old flow overwrote fresh theory with '').
    const saved = useRef<{ theory: string; subtopics: Subtopic[] }>({ theory: '', subtopics: [] });

    const isCompleted = !!progress.roadmaps.find((r) => r.roadmapId === roadmapId)?.completedLevels.includes(level.id);
    const existingResult = progress.roadmaps.find((r) => r.roadmapId === roadmapId)?.quizResults.find((q) => q.levelId === level.id);
    const activeSub = activeIdx >= 0 ? subtopics[activeIdx] : null;

    const persistContent = useCallback(async () => {
        if (!roadmapDbId) return;
        try {
            await api.saveLevelContent({
                roadmap_id: roadmapDbId,
                level_id: level.id,
                theory_content: saved.current.theory,
                subtopics: saved.current.subtopics,
            });
        } catch (e) {
            console.error('[LevelView] save content failed', e);
        }
    }, [roadmapDbId, level.id]);

    // ── Load from DB, generate whatever is missing (in parallel) ──
    useEffect(() => {
        let cancelled = false;
        setErrors({});

        const genOverview = async () => {
            setLoadingOverview(true);
            setStreamingId('overview');
            try {
                const content = await aiService.generateLevelContentStream(topic, level.title, level.description, (acc) => {
                    if (!cancelled) setOverview(acc);
                });
                if (cancelled) return;
                saved.current.theory = content;
                persistContent();
            } catch (e: any) {
                if (!cancelled) setErrors((x) => ({ ...x, overview: e?.message || 'The lesson could not be generated.' }));
            } finally {
                if (!cancelled) { setLoadingOverview(false); setStreamingId((s) => (s === 'overview' ? null : s)); }
            }
        };

        const genSubtopics = async () => {
            setLoadingSubtopics(true);
            try {
                const subs = await aiService.generateSubtopics(topic, level.title, level.description);
                if (cancelled) return;
                const mapped = subs.map((s, i) => ({ id: `${level.id}-sub${i}`, title: s.title, description: s.description, content: '' }));
                setSubtopics(mapped);
                saved.current.subtopics = mapped;
                persistContent();
            } catch (e) {
                console.warn('[LevelView] subtopics failed', e);
            } finally {
                if (!cancelled) setLoadingSubtopics(false);
            }
        };

        const genQuiz = async () => {
            setLoadingQuiz(true);
            try {
                const qs = await aiService.generateQuiz(topic, level.title);
                if (cancelled) return;
                const mapped: QuizQuestion[] = qs.map((q, i) => ({ id: `${level.id}-q${i}`, ...q }));
                setQuiz(mapped);
                if (roadmapDbId) api.saveLevelQuiz({ roadmap_id: roadmapDbId, level_id: level.id, questions: mapped }).catch(() => {});
            } catch (e: any) {
                if (!cancelled) setErrors((x) => ({ ...x, quiz: e?.message || 'The quiz could not be generated.' }));
            } finally {
                if (!cancelled) setLoadingQuiz(false);
            }
        };

        (async () => {
            let hasTheory = !!level.theoryContent;
            let hasSubs = false;
            let hasQuiz = (level.quiz || []).length > 0;
            saved.current = { theory: level.theoryContent || '', subtopics: [] };

            if (roadmapDbId) {
                try {
                    const [c, q] = await Promise.all([
                        api.getLevelContent(roadmapDbId, level.id),
                        api.getLevelQuiz(roadmapDbId, level.id),
                    ]);
                    if (cancelled) return;
                    if (c?.exists && typeof c.theory_content === 'string' && c.theory_content.trim()) {
                        hasTheory = true;
                        saved.current.theory = c.theory_content;
                        setOverview(c.theory_content);
                        setLoadingOverview(false);
                    }
                    if (c?.exists && Array.isArray(c.subtopics) && c.subtopics.length) {
                        hasSubs = true;
                        const subs = normalizeSubtopics(level.id, c.subtopics);
                        saved.current.subtopics = subs;
                        setSubtopics(subs);
                        setLoadingSubtopics(false);
                    }
                    if (q?.exists && Array.isArray(q.questions) && q.questions.length) {
                        hasQuiz = true;
                        setQuiz(q.questions);
                        setLoadingQuiz(false);
                    }
                } catch (err) {
                    console.error('[LevelView] DB load failed', err);
                }
            }
            if (cancelled) return;
            await Promise.all([
                hasTheory ? null : genOverview(),
                hasSubs ? setLoadingSubtopics(false) : genSubtopics(),
                hasQuiz ? setLoadingQuiz(false) : genQuiz(),
            ]);
        })();

        return () => { cancelled = true; };
    }, [level.id, roadmapDbId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Sub-module content (streamed, then saved so it is generated once) ──
    useEffect(() => {
        if (!activeSub || activeSub.content || subtopicContent[activeSub.id]) return;
        let cancelled = false;
        const sub = activeSub;
        setStreamingId(sub.id);
        setErrors((x) => ({ ...x, sub: undefined }));
        aiService.generateSubtopicContentStream(topic, level.title, sub.title, sub.description, (acc) => {
            if (!cancelled) setSubtopicContent((prev) => ({ ...prev, [sub.id]: acc }));
        })
            .then((content) => {
                saved.current.subtopics = (saved.current.subtopics.length ? saved.current.subtopics : subtopics)
                    .map((s) => (s.id === sub.id ? { ...s, content } : s));
                setSubtopics((prev) => prev.map((s) => (s.id === sub.id ? { ...s, content } : s)));
                persistContent();
            })
            .catch((err) => { if (!cancelled) setErrors((x) => ({ ...x, sub: err?.message || 'Failed to load this sub-module.' })); })
            .finally(() => { if (!cancelled) setStreamingId((s) => (s === sub.id ? null : s)); });
        return () => { cancelled = true; };
    }, [activeIdx, activeSub?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const selectSub = (i: number) => {
        setActiveIdx(i);
        contentTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleQuizSubmit = (result: QuizResult) => {
        const already = isCompleted;
        progressService.saveQuizResult(roadmapId, topic, result, roadmapDbId);
        progressService.completeLevel(roadmapId, topic, level.id, level.xpReward, roadmapDbId);
        setCelebrate({ xp: already ? 0 : level.xpReward, score: result.score, total: result.total });
        if (already) toast.success(`Quiz retaken: ${result.score}/${result.total}`);
    };

    const content = activeSub ? (subtopicContent[activeSub.id] || activeSub.content || '') : overview;
    const loading = activeSub ? !content && streamingId === activeSub.id : loadingOverview && !overview;
    const isStreaming = streamingId === (activeSub ? activeSub.id : 'overview');
    const error = activeSub ? errors.sub : errors.overview;

    return (
        <div className="mx-auto max-w-6xl">
            {/* top bar */}
            <div className="mb-6 flex items-center justify-between gap-3">
                <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-ink">
                    <ArrowLeft className="size-4" /> <span className="hidden sm:inline">{topic}</span><span className="sm:hidden">Back</span>
                </button>
                <div className="flex items-center gap-2">
                    {isCompleted && <Badge tone="success" icon={<Check className="size-3" />}>Completed</Badge>}
                    <Badge tone="warning" icon={<Zap className="size-3" />}>{level.xpReward} XP</Badge>
                </div>
            </div>

            {/* header */}
            <div className="mb-6">
                <div className="flex items-center gap-3">
                    <span className="eyebrow">Level {levelNumber} of {totalLevels}</span>
                    <div className="h-1 w-24 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: `${(levelNumber / totalLevels) * 100}%` }} />
                    </div>
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{level.title}</h1>
                {level.description && <p className="mt-2 max-w-3xl text-muted">{level.description}</p>}
            </div>

            <Segmented<'learn' | 'quiz'>
                value={tab}
                onChange={setTab}
                className="mb-6"
                options={[
                    { value: 'learn', label: 'Learn', icon: <BookOpen /> },
                    { value: 'quiz', label: <>Quiz{existingResult && <Check className="ml-1 !size-3.5 text-emerald-500" />}</>, icon: <CircleHelp /> },
                ]}
            />

            {tab === 'learn' ? (
                <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
                    {/* module list */}
                    <nav className="lg:sticky lg:top-0 lg:self-start">
                        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
                            <button
                                onClick={() => selectSub(-1)}
                                className={cn(
                                    'flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition',
                                    activeIdx === -1 ? 'border-brand-500/40 bg-brand-500/10 text-ink' : 'border-line bg-surface/60 text-muted hover:text-ink',
                                )}
                            >
                                <span className={cn('flex size-7 items-center justify-center rounded-lg', activeIdx === -1 ? 'bg-brand-500 text-white' : 'bg-sunken')}><Home className="size-3.5" /></span>
                                Overview
                            </button>
                            <div className="eyebrow hidden px-3 pb-1 pt-4 lg:block">Sub-modules</div>
                            {loadingSubtopics && subtopics.length === 0 && [0, 1, 2].map((i) => <div key={i} className="skeleton h-11 w-40 shrink-0 lg:w-auto" />)}
                            {subtopics.map((sub, idx) => {
                                const done = !!(sub.content || subtopicContent[sub.id]);
                                return (
                                    <button
                                        key={sub.id}
                                        onClick={() => selectSub(idx)}
                                        className={cn(
                                            'flex max-w-[220px] shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition lg:max-w-none',
                                            activeIdx === idx ? 'border-brand-500/40 bg-brand-500/10 text-ink' : 'border-line bg-surface/60 text-muted hover:text-ink',
                                        )}
                                    >
                                        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                                            activeIdx === idx ? 'bg-brand-500 text-white' : done ? 'bg-emerald-500/15 text-emerald-500' : 'bg-sunken')}>
                                            {done && activeIdx !== idx ? <Check className="size-3.5" /> : idx + 1}
                                        </span>
                                        <span className="truncate">{sub.title}</span>
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setTab('quiz')}
                                className="flex shrink-0 items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-left text-sm font-medium text-muted transition hover:border-brand-500/50 hover:text-brand-500 lg:mt-2"
                            >
                                <span className="flex size-7 items-center justify-center rounded-lg bg-sunken"><CircleHelp className="size-3.5" /></span>
                                Take the quiz
                            </button>
                        </div>
                    </nav>

                    {/* reading pane */}
                    <div className="min-w-0" ref={contentTop}>
                        <Card className="p-6 sm:p-10">
                            {activeSub && (
                                <div className="mb-6 border-b border-line pb-6">
                                    <div className="eyebrow text-brand-500">Sub-module {activeIdx + 1} of {subtopics.length}</div>
                                    <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">{activeSub.title}</h2>
                                    {activeSub.description && <p className="mt-1 text-muted">{activeSub.description}</p>}
                                </div>
                            )}
                            {error && !content ? (
                                <div className="py-10 text-center">
                                    <p className="font-medium">This lesson couldn’t be written right now.</p>
                                    <p className="mt-1 text-sm text-muted">{error}</p>
                                    <Button className="mt-5" icon={<RefreshCw className="size-4" />} onClick={() => {
                                        if (activeSub) { setSubtopicContent((p) => { const n = { ...p }; delete n[activeSub.id]; return n; }); setActiveIdx(-1); setTimeout(() => setActiveIdx(activeIdx), 0); }
                                        else setReloadKey((k) => k + 1);
                                    }}>Try again</Button>
                                </div>
                            ) : loading ? (
                                <LoadingBlock label={activeSub ? `Writing “${activeSub.title}”…` : 'Writing your lesson…'} />
                            ) : content ? (
                                <Markdown streaming={isStreaming}>{content}</Markdown>
                            ) : (
                                <p className="py-10 text-center text-muted">Pick a sub-module to start.</p>
                            )}
                        </Card>

                        <div className="mt-4 flex items-center justify-between gap-2">
                            <Button variant="ghost" size="sm" disabled={activeIdx === -1} onClick={() => selectSub(activeIdx - 1)}>
                                <ArrowLeft className="size-4" /> <span className="max-w-[140px] truncate">{activeIdx <= 0 ? 'Overview' : subtopics[activeIdx - 1]?.title}</span>
                            </Button>
                            {activeIdx < subtopics.length - 1 ? (
                                <Button variant="secondary" size="sm" onClick={() => selectSub(activeIdx + 1)}>
                                    <span className="max-w-[160px] truncate">{subtopics[activeIdx + 1]?.title}</span> <ArrowRight className="size-4" />
                                </Button>
                            ) : (
                                <Button variant="primary" size="sm" onClick={() => setTab('quiz')}>
                                    Take the quiz <ArrowRight className="size-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mx-auto max-w-3xl">
                    {loadingQuiz ? (
                        <Card className="p-8"><LoadingBlock label="Writing your quiz…" /></Card>
                    ) : quiz.length > 0 ? (
                        <QuizView questions={quiz} levelId={level.id} onSubmit={handleQuizSubmit} existingResult={existingResult} />
                    ) : (
                        <Card className="p-10 text-center">
                            <p className="font-medium">No quiz yet for this level.</p>
                            {errors.quiz && <p className="mt-1 text-sm text-muted">{errors.quiz}</p>}
                            <Button className="mt-5" icon={<RefreshCw className="size-4" />} onClick={() => setReloadKey((k) => k + 1)}>Generate quiz</Button>
                        </Card>
                    )}
                </div>
            )}

            {/* footer nav */}
            <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
                <Button variant="ghost" onClick={onBack}><ArrowLeft className="size-4" /> Roadmap</Button>
                {!isLastLevel && (
                    <Button variant={isCompleted ? 'primary' : 'secondary'} onClick={onNext} disabled={!isCompleted} title={isCompleted ? undefined : 'Finish this level’s quiz to unlock the next one'}>
                        Next level <ArrowRight className="size-4" />
                    </Button>
                )}
            </div>

            {/* celebration */}
            <Modal open={!!celebrate} onClose={() => setCelebrate(null)} className="text-center">
                <AnimatePresence>
                    {celebrate && (
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-2">
                            <motion.div
                                initial={{ rotate: -20, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }}
                                transition={{ type: 'spring', bounce: 0.6 }}
                                className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-xl shadow-orange-500/30"
                            >
                                <PartyPopper className="size-9" />
                            </motion.div>
                            <h3 className="mt-6 text-2xl font-semibold tracking-tight">Level complete!</h3>
                            <p className="mt-1 text-muted">You scored {celebrate.score}/{celebrate.total} on “{level.title}”.</p>
                            {celebrate.xp > 0 && (
                                <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-lg font-semibold text-amber-500">
                                    <Zap className="size-5" fill="currentColor" /> +{celebrate.xp} XP
                                </div>
                            )}
                            <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
                                <Button variant="ghost" onClick={() => setCelebrate(null)}>Review answers</Button>
                                {isLastLevel ? (
                                    <Button variant="primary" onClick={() => { setCelebrate(null); onBack(); }}>Back to roadmap</Button>
                                ) : (
                                    <Button variant="primary" onClick={() => { setCelebrate(null); onNext(); }}>Next level <ArrowRight className="size-4" /></Button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Modal>
        </div>
    );
};

export default LevelView;
