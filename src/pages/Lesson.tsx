import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
    ArrowUp, Bot, Check, ChevronLeft, Flag, Lock, PartyPopper, RefreshCw, RotateCcw, Sparkles, Target, X, Zap,
} from 'lucide-react';
import { QuizResult } from '../types';
import { progressService, useProgress } from '../services/progressService';
import { roadmapStore, useRoadmaps } from '../services/roadmapStore';
import { aiService } from '../services/llamaService';
import * as api from '../services/apiService';
import { useLevelContent } from '../lib/useLevelContent';
import { setLessonStage } from '../lib/lessonProgress';
import { setActiveCourse } from '../lib/activeCourse';
import { cn } from '../lib/cn';
import { Button, Drawer, Spinner } from '../ui';
import Markdown from '../ui/Markdown';
import { LogoMark } from '../shell/Logo';

/** Share of quiz answers needed to complete a level. */
const PASS_RATIO = 0.6;

type Step =
    | { type: 'read'; key: string; title: string; subIdx: number }
    | { type: 'question'; key: string; qIdx: number }
    | { type: 'done'; key: 'done' };

const ReadingSkeleton: React.FC<{ label: string }> = ({ label }) => (
    <div className="space-y-4">
        <div className="flex items-center gap-2 font-bold text-muted"><Sparkles className="size-5 animate-pulse text-brand-500" />{label}</div>
        <div className="skeleton h-5 w-full" /><div className="skeleton h-5 w-11/12" /><div className="skeleton h-5 w-4/5" />
        <div className="skeleton mt-6 h-40 w-full" />
    </div>
);

/** Contextual tutor: knows the course, the level and the step on screen. */
const LessonTutor: React.FC<{ topic: string; levelTitle: string; context: string; onClose: () => void }> = ({ topic, levelTitle, context, onClose }) => {
    const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const session = useRef<any>(null);
    const scroll = useRef<HTMLDivElement>(null);
    useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [msgs]);

    const send = async (text: string) => {
        if (!text.trim() || busy) return;
        const userId = progressService.getDbUserId();
        const history = [...msgs, { role: 'user' as const, text }];
        setMsgs([...history, { role: 'assistant', text: '' }]);
        setInput('');
        setBusy(true);
        try {
            if (userId && !session.current) session.current = await api.createChatSession(userId, `Lesson: ${levelTitle}`.slice(0, 200)).catch(() => null);
            if (userId && session.current) api.saveMessage({ user_id: userId, session_id: session.current.id, role: 'user', content: text }).catch(() => {});
            const system = `You are Cognify's tutor helping a learner inside a lesson. Course: "${topic}". Level: "${levelTitle}". Here is what is on their screen:\n\n${context.slice(0, 5000)}\n\nAnswer their question about it clearly and briefly, with an example when useful. Use markdown.`;
            let full = '';
            await aiService.chatStream(history.map((m) => ({ role: m.role, content: m.text })), (acc) => {
                full = acc;
                setMsgs((p) => p.map((m, i) => (i === p.length - 1 ? { ...m, text: acc } : m)));
            }, system);
            if (userId && session.current && full) api.saveMessage({ user_id: userId, session_id: session.current.id, role: 'assistant', content: full }).catch(() => {});
        } catch (err: any) {
            setMsgs((p) => p.map((m, i) => (i === p.length - 1 ? { ...m, text: `_The tutor is unavailable right now._ ${err?.message ? `(${err.message})` : ''}` } : m)));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b-2 border-line p-4">
                <LogoMark className="size-9" />
                <div className="min-w-0 flex-1"><div className="font-bold">Ask your tutor</div><div className="truncate text-xs text-subtle">About “{levelTitle}”</div></div>
                <button onClick={onClose} className="rounded-lg p-1.5 text-subtle hover:bg-sunken"><X className="size-5" /></button>
            </div>
            <div ref={scroll} className="flex-1 space-y-4 overflow-y-auto p-4">
                {msgs.length === 0 && (
                    <div className="space-y-2">
                        <p className="text-sm text-muted">Stuck? Ask anything about this part of the lesson.</p>
                        {['Explain this more simply', 'Give me a real-world example', 'What should I remember from this?'].map((s) => (
                            <button key={s} onClick={() => send(s)} className="block w-full rounded-xl border-2 border-line px-3 py-2 text-left text-sm font-semibold hover:border-brand-300">{s}</button>
                        ))}
                    </div>
                )}
                {msgs.map((m, i) => m.role === 'user' ? (
                    <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-3.5 py-2 text-sm font-medium text-white">{m.text}</div>
                ) : (
                    <div key={i} className="text-sm">{m.text ? <Markdown streaming={busy && i === msgs.length - 1} className="prose-sm">{m.text}</Markdown> : <Spinner className="size-4" />}</div>
                ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t-2 border-line p-3">
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" className="input" />
                <Button variant="primary" size="icon" type="submit" disabled={!input.trim() || busy}><ArrowUp className="size-5" /></Button>
            </form>
        </div>
    );
};

const Lesson: React.FC = () => {
    const { courseId = '', levelId = '' } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { roadmaps, loaded } = useRoadmaps();
    const { progress } = useProgress();
    useEffect(() => { roadmapStore.load(); }, []);

    const course = roadmaps.find((r) => r.id === courseId);
    const levelIdx = course ? course.levels.findIndex((l) => l.id === decodeURIComponent(levelId)) : -1;
    const level = course && levelIdx >= 0 ? course.levels[levelIdx] : null;
    const rp = progress.roadmaps.find((r) => r.roadmapId === courseId);
    const completed = new Set(rp?.completedLevels || []);
    const locked = !!course && levelIdx > 0 && !completed.has(course.levels[levelIdx - 1].id);
    const alreadyDone = !!level && completed.has(level.id);

    const content = useLevelContent(level, course?.topic || '', course?.dbId);
    const { overview, subtopics, quiz, loading, streaming, errors } = content;

    const steps: Step[] = useMemo(() => {
        const s: Step[] = [{ type: 'read', key: 'overview', title: 'Overview', subIdx: -1 }];
        subtopics.slice(0, 6).forEach((sub, i) => s.push({ type: 'read', key: sub.id, title: sub.title, subIdx: i }));
        quiz.forEach((_, i) => s.push({ type: 'question', key: `q${i}`, qIdx: i }));
        s.push({ type: 'done', key: 'done' });
        return s;
    }, [subtopics, quiz]);

    const [idx, setIdx] = useState(0);
    const [target, setTarget] = useState<string | null>(params.get('at'));
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [checked, setChecked] = useState<Record<number, boolean>>({});
    const [selected, setSelected] = useState<number | null>(null);
    const [tutorOpen, setTutorOpen] = useState(false);
    const [result, setResult] = useState<{ score: number; total: number; xp: number; passed: boolean } | null>(null);
    const [wiggle, setWiggle] = useState(0);
    const isWide = typeof window !== 'undefined' && window.innerWidth >= 1024;

    // Jump to the node the learner clicked on the path, once its steps exist.
    useEffect(() => {
        if (!target || loading.subtopics) return;
        if (target === 'deep') { const i = steps.findIndex((s) => s.type === 'read' && s.subIdx === 0); if (i > 0) setIdx(i); setTarget(null); }
        else if (target === 'quiz') { if (!loading.quiz) { const i = steps.findIndex((s) => s.type === 'question'); if (i > 0) setIdx(i); setTarget(null); } }
        else setTarget(null);
    }, [target, steps, loading.subtopics, loading.quiz]);

    const step = steps[Math.min(idx, steps.length - 1)];

    // Generate the current and next sub-module ahead of time; record progress.
    useEffect(() => {
        if (!course || !level || !step) return;
        if (step.type === 'read') {
            const sub = step.subIdx >= 0 ? subtopics[step.subIdx] : undefined;
            content.ensureSub(sub);
            const next = steps[idx + 1];
            if (next?.type === 'read' && next.subIdx >= 0) content.ensureSub(subtopics[next.subIdx]);
            setLessonStage(course.id, level.id, step.subIdx >= 0 ? 'deep' : 'overview');
        } else if (step.type === 'question') {
            setLessonStage(course.id, level.id, 'quiz');
        }
    }, [step?.key, subtopics.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const finish = useCallback(() => {
        if (!course || !level) return;
        const total = quiz.length;
        const score = quiz.reduce((a, q, i) => a + (answers[i] === q.correctIndex ? 1 : 0), 0);
        const r: QuizResult = { levelId: level.id, score, total, answers: quiz.map((_, i) => answers[i] ?? -1), submittedAt: new Date().toISOString() };
        const passed = total === 0 || score / total >= PASS_RATIO;
        if (total > 0) progressService.saveQuizResult(course.id, course.topic, r, course.dbId);
        if (passed) progressService.completeLevel(course.id, course.topic, level.id, level.xpReward, course.dbId);
        setActiveCourse(course.id);
        setResult({ score, total, passed, xp: passed && !alreadyDone ? level.xpReward : 0 });
    }, [course, level, quiz, answers, alreadyDone]);

    const goNext = () => {
        if (steps[idx + 1]?.type === 'done' && (loading.quiz || loading.subtopics)) return;
        setSelected(null);
        const next = Math.min(idx + 1, steps.length - 1);
        if (steps[next]?.type === 'done' && !result) finish();
        setIdx(next);
        window.scrollTo({ top: 0 });
    };

    const check = () => {
        if (step?.type !== 'question' || selected == null) return;
        setAnswers((a) => ({ ...a, [step.qIdx]: selected }));
        setChecked((c) => ({ ...c, [step.qIdx]: true }));
        if (selected !== quiz[step.qIdx].correctIndex) setWiggle((w) => w + 1);
    };

    const retryQuiz = () => {
        setAnswers({}); setChecked({}); setSelected(null); setResult(null);
        setIdx(steps.findIndex((s) => s.type === 'question'));
    };

    // keyboard: 1-4 choose, Enter check/continue
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (tutorOpen || (e.target as HTMLElement)?.tagName === 'INPUT') return;
            if (step?.type === 'question' && !checked[step.qIdx]) {
                const n = Number(e.key);
                if (n >= 1 && n <= (quiz[step.qIdx]?.options.length || 0)) setSelected(n - 1);
                if (e.key === 'Enter' && selected != null) check();
            } else if (e.key === 'Enter' && step?.type !== 'done') goNext();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    if (!course || !level) {
        return (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
                {!loaded ? <Spinner className="size-8" /> : (
                    <>
                        <p className="font-display text-xl font-bold">This lesson couldn’t be found.</p>
                        <Link to="/learn"><Button variant="primary">Back to Learn</Button></Link>
                    </>
                )}
            </div>
        );
    }
    if (locked) {
        return (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="flex size-20 items-center justify-center rounded-full bg-line text-subtle"><Lock className="size-9" /></div>
                <p className="font-display text-2xl font-bold">Level locked</p>
                <p className="max-w-sm text-muted">Finish “{course.levels[levelIdx - 1].title}” first to unlock this level.</p>
                <Link to="/learn"><Button variant="primary">Back to the path</Button></Link>
            </div>
        );
    }

    const readText = step?.type === 'read' ? (step.subIdx < 0 ? overview : content.textFor(subtopics[step.subIdx])) : '';
    const readErr = step?.type === 'read' ? (step.subIdx < 0 ? errors.overview : errors[subtopics[step.subIdx]?.id]) : undefined;
    const readStreaming = step?.type === 'read' && streaming === (step.subIdx < 0 ? 'overview' : subtopics[step.subIdx]?.id);
    const q = step?.type === 'question' ? quiz[step.qIdx] : null;
    const isChecked = step?.type === 'question' && checked[step.qIdx];
    const correct = q && isChecked ? answers[(step as any).qIdx] === q.correctIndex : false;
    const pct = steps.length > 1 ? (Math.min(idx, steps.length - 1) / (steps.length - 1)) * 100 : 0;
    const tutorContext = step?.type === 'read' ? readText : q ? `Quiz question: ${q.question}\nOptions: ${q.options.join(' | ')}` : level.description;

    return (
        <div className="flex min-h-dvh bg-bg">
            <div className="flex min-w-0 flex-1 flex-col">
                {/* top bar */}
                <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur">
                    <div className="mx-auto flex h-16 max-w-4xl items-center gap-4 px-4">
                        <button onClick={() => navigate('/learn')} className="rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-ink" aria-label="Exit lesson"><X className="size-6" strokeWidth={2.6} /></button>
                        <div className="h-4 flex-1 overflow-hidden rounded-full bg-sunken">
                            <motion.div className="relative h-full rounded-full bg-emerald-500" animate={{ width: `${Math.max(4, pct)}%` }} transition={{ type: 'spring', bounce: 0.2 }}>
                                <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/35" />
                            </motion.div>
                        </div>
                        <Button variant={tutorOpen ? 'soft' : 'ghost'} size="sm" icon={<Bot className="size-4" />} onClick={() => setTutorOpen((o) => !o)}>
                            <span className="hidden sm:inline">Ask tutor</span>
                        </Button>
                    </div>
                </header>

                {/* body */}
                <div className="mx-auto w-full max-w-2xl flex-1 px-5 pb-48 pt-6">
                    <AnimatePresence mode="wait">
                        <motion.div key={step?.key} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
                            {step?.type === 'read' && (
                                <article>
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className="rounded-lg bg-brand-500/12 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-300">
                                            {step.subIdx < 0 ? `Level ${levelIdx + 1}` : `Part ${step.subIdx + 1} of ${Math.min(subtopics.length, 6)}`}
                                        </span>
                                        <span className="text-xs font-bold text-subtle">{course.topic}</span>
                                    </div>
                                    <h1 className="mb-6 text-3xl font-extrabold sm:text-4xl">{step.subIdx < 0 ? level.title : step.title}</h1>
                                    {readErr && !readText ? (
                                        <div className="rounded-2xl border-2 border-dashed border-line p-8 text-center">
                                            <p className="font-bold">This part couldn’t be written right now.</p>
                                            <p className="mt-1 text-sm text-muted">{readErr}</p>
                                            <Button className="mt-4" icon={<RefreshCw className="size-4" />} onClick={() => (step.subIdx < 0 ? content.reload() : content.ensureSub(subtopics[step.subIdx]))}>Try again</Button>
                                        </div>
                                    ) : readText ? (
                                        <Markdown streaming={readStreaming} className="prose-lg">{readText}</Markdown>
                                    ) : (
                                        <ReadingSkeleton label={step.subIdx < 0 ? 'Writing your lesson…' : `Writing “${step.title}”…`} />
                                    )}
                                    {step.subIdx < 0 && loading.subtopics && <p className="mt-6 flex items-center gap-2 text-sm text-subtle"><Spinner className="size-4" /> Preparing the deep-dive parts…</p>}
                                </article>
                            )}

                            {step?.type === 'question' && (
                                !q ? <ReadingSkeleton label="Writing your quiz…" /> : (
                                    <div>
                                        <div className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-pink-500">
                                            <Target className="size-4" /> Question {step.qIdx + 1} of {quiz.length}
                                        </div>
                                        <h1 className="mb-8 text-2xl font-extrabold leading-snug sm:text-3xl">{q.question}</h1>
                                        <motion.div key={wiggle} animate={wiggle && isChecked && !correct ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.4 }} className="grid gap-3">
                                            {q.options.map((opt, oi) => {
                                                const chosen = (isChecked ? answers[step.qIdx] : selected) === oi;
                                                const isRight = isChecked && oi === q.correctIndex;
                                                const isWrong = isChecked && chosen && oi !== q.correctIndex;
                                                return (
                                                    <button key={oi} disabled={isChecked} onClick={() => setSelected(oi)}
                                                        className={cn('flex items-center gap-4 rounded-2xl border-2 px-4 py-4 text-left text-[15px] font-semibold transition-all',
                                                            isRight ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                                                : isWrong ? 'border-red-400 bg-red-500/10 text-red-700 dark:text-red-300'
                                                                    : chosen ? 'border-brand-400 bg-brand-500/10 text-brand-700 shadow-[0_3px_0_0_var(--color-brand-300)] dark:text-brand-200'
                                                                        : 'border-line bg-surface shadow-[0_3px_0_0_var(--c-line)] hover:bg-sunken active:translate-y-[3px] active:shadow-none')}>
                                                        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border-2 font-mono text-sm font-bold',
                                                            isRight ? 'border-emerald-500 text-emerald-600' : isWrong ? 'border-red-400 text-red-500' : chosen ? 'border-brand-400 text-brand-600' : 'border-line text-subtle')}>
                                                            {isRight ? <Check className="size-4" strokeWidth={3} /> : isWrong ? <X className="size-4" strokeWidth={3} /> : oi + 1}
                                                        </span>
                                                        {opt}
                                                    </button>
                                                );
                                            })}
                                        </motion.div>
                                    </div>
                                )
                            )}

                            {step?.type === 'done' && (
                                <div className="flex flex-col items-center pt-6 text-center">
                                    <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.55 }}
                                        className={cn('flex size-28 items-center justify-center rounded-[32px] text-white', result?.passed === false ? 'bg-sky-500 shadow-[0_8px_0_0_#0369a1]' : 'bg-amber-400 shadow-[0_8px_0_0_#d97706]')}>
                                        {result?.passed === false ? <RotateCcw className="size-14" /> : <PartyPopper className="size-14" />}
                                    </motion.div>
                                    <h1 className={cn('mt-8 text-4xl font-extrabold', result?.passed === false ? 'text-sky-500' : 'text-amber-500')}>{result?.passed === false ? 'So close!' : 'Level complete!'}</h1>
                                    <p className="mt-2 text-muted">{result?.passed === false
                                        ? `You need ${Math.ceil(result.total * PASS_RATIO)} of ${result.total} correct to pass “${level.title}”. Review and try again.`
                                        : `You finished “${level.title}”.`}</p>
                                    {result && (
                                        <div className="mt-8 grid w-full max-w-md grid-cols-3 gap-3">
                                            {[
                                                { label: 'Total XP', value: `+${result.xp}`, color: 'border-amber-400 text-amber-500', icon: Zap },
                                                { label: 'Accuracy', value: result.total ? `${Math.round((result.score / result.total) * 100)}%` : '—', color: 'border-emerald-500 text-emerald-500', icon: Target },
                                                { label: 'Correct', value: result.total ? `${result.score}/${result.total}` : '—', color: 'border-sky-500 text-sky-500', icon: Flag },
                                            ].map((s) => (
                                                <div key={s.label} className={cn('overflow-hidden rounded-2xl border-2', s.color)}>
                                                    <div className={cn('py-1 text-[11px] font-extrabold uppercase tracking-wider text-white', s.color.replace('border-', 'bg-').split(' ')[0])}>{s.label}</div>
                                                    <div className="flex items-center justify-center gap-1 py-3 font-display text-2xl font-extrabold"><s.icon className="size-5" />{s.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {result && result.passed && result.xp === 0 && <p className="mt-4 text-sm text-subtle">You’d already completed this level, so no new XP — but practice still counts toward your streak.</p>}
                                    {result && result.total > 0 && result.score < result.total && (
                                        <Button variant={result.passed ? 'secondary' : 'primary'} size={result.passed ? 'md' : 'lg'} uppercase={!result.passed} className="mt-6" icon={<RotateCcw className="size-4" />} onClick={retryQuiz}>Retry the quiz</Button>
                                    )}
                                    {result?.passed === false && (
                                        <button onClick={() => { setResult(null); setAnswers({}); setChecked({}); setIdx(0); }} className="mt-3 text-sm font-bold text-subtle hover:text-muted">Review the lesson first</button>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* bottom action bar */}
                <div className={cn('fixed inset-x-0 bottom-0 z-20 border-t-2 transition-colors',
                    isChecked ? (correct ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950' : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950') : 'border-line bg-surface',
                    tutorOpen && isWide && 'lg:right-[400px]')}>
                    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center">
                        {isChecked && q ? (
                            <div className="flex min-w-0 flex-1 items-start gap-4">
                                <div className={cn('hidden size-14 shrink-0 items-center justify-center rounded-full bg-surface sm:flex', correct ? 'text-emerald-500' : 'text-red-500')}>
                                    {correct ? <Check className="size-8" strokeWidth={3.5} /> : <X className="size-8" strokeWidth={3.5} />}
                                </div>
                                <div className="min-w-0">
                                    <div className={cn('font-display text-xl font-extrabold', correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                                        {correct ? ['Nicely done!', 'Correct!', 'You got it!', 'Excellent!'][(step as any).qIdx % 4] : 'Not quite'}
                                    </div>
                                    {!correct && <div className="text-sm font-bold text-red-700 dark:text-red-300">Correct answer: {q.options[q.correctIndex]}</div>}
                                    {q.explanation && <div className={cn('mt-1 text-sm', correct ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200')}>{q.explanation}</div>}
                                </div>
                            </div>
                        ) : (
                            <div className="hidden flex-1 sm:block">
                                {idx > 0 && step?.type !== 'done' && (
                                    <Button variant="secondary" size="lg" uppercase icon={<ChevronLeft className="size-5" />} onClick={() => { setSelected(null); setIdx(idx - 1); }}>Back</Button>
                                )}
                            </div>
                        )}
                        {step?.type === 'question' && !isChecked ? (
                            <Button variant="success" size="lg" uppercase className="sm:min-w-44" disabled={selected == null || !q} onClick={check}>Check</Button>
                        ) : step?.type === 'done' ? (
                            <Button variant="primary" size="lg" uppercase className="sm:min-w-44" onClick={() => navigate('/learn')}>Continue</Button>
                        ) : (
                            <Button variant={isChecked ? (correct ? 'success' : 'danger') : 'primary'} size="lg" uppercase className="sm:min-w-44"
                                disabled={steps[idx + 1]?.type === 'done' && (loading.quiz || loading.subtopics)}
                                loading={steps[idx + 1]?.type === 'done' && (loading.quiz || loading.subtopics)}
                                onClick={goNext}>
                                {steps[idx + 1]?.type === 'done' && (loading.quiz || loading.subtopics) ? 'Preparing quiz' : steps[idx + 1]?.type === 'done' ? 'Finish' : 'Continue'}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* tutor side panel (desktop) / drawer (mobile) */}
            {isWide ? (
                <AnimatePresence>
                    {tutorOpen && (
                        <motion.aside initial={{ width: 0 }} animate={{ width: 400 }} exit={{ width: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                            className="sticky top-0 z-30 h-dvh shrink-0 overflow-hidden border-l-2 border-line bg-surface">
                            <div className="h-full w-[400px]"><LessonTutor topic={course.topic} levelTitle={level.title} context={tutorContext} onClose={() => setTutorOpen(false)} /></div>
                        </motion.aside>
                    )}
                </AnimatePresence>
            ) : (
                <Drawer open={tutorOpen} onClose={() => setTutorOpen(false)} side="right" className="max-w-md">
                    <LessonTutor topic={course.topic} levelTitle={level.title} context={tutorContext} onClose={() => setTutorOpen(false)} />
                </Drawer>
            )}
        </div>
    );
};

export default Lesson;
