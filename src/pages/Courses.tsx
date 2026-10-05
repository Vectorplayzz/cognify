import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, BookOpen, Check, ExternalLink, MoreHorizontal, Play, Search, Sparkles, Trash2, Wand2, Zap } from 'lucide-react';
import { GeneratedRoadmap, RoadmapLevel, RoadmapSource } from '../types';
import * as api from '../services/apiService';
import { progressService, useProgress } from '../services/progressService';
import { roadmapStore, toRoadmap, useRoadmaps } from '../services/roadmapStore';
import { setActiveCourse, useActiveCourseId } from '../lib/activeCourse';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';
import { Badge, Button, ProgressBar, Tabs } from '../ui';
import { useConfirm } from '../ui/useConfirm';
import { UNIT_COLORS } from './Learn';

const CATALOG: Record<string, { name: string; emoji: string; blurb: string }[]> = {
    'Programming': [
        { name: 'Python Programming', emoji: '🐍', blurb: 'From syntax to real projects' },
        { name: 'JavaScript', emoji: '🟨', blurb: 'The language of the web' },
        { name: 'Rust', emoji: '🦀', blurb: 'Fast, safe systems code' },
        { name: 'Go', emoji: '🐹', blurb: 'Simple, concurrent services' },
        { name: 'Java', emoji: '☕', blurb: 'OOP and the JVM' },
        { name: 'C++', emoji: '⚙️', blurb: 'Performance and memory' },
    ],
    'Data & AI': [
        { name: 'Machine Learning', emoji: '🤖', blurb: 'Models that learn from data' },
        { name: 'Deep Learning', emoji: '🧠', blurb: 'Neural networks & beyond' },
        { name: 'Data Science', emoji: '📊', blurb: 'Insights from messy data' },
        { name: 'SQL', emoji: '🗄️', blurb: 'Query any database' },
        { name: 'Prompt Engineering', emoji: '💬', blurb: 'Get more from LLMs' },
        { name: 'Statistics', emoji: '📈', blurb: 'Reason with uncertainty' },
    ],
    'Web & Mobile': [
        { name: 'Frontend Development', emoji: '🎨', blurb: 'HTML, CSS and modern UI' },
        { name: 'React', emoji: '⚛️', blurb: 'Components, hooks, state' },
        { name: 'Backend Development', emoji: '🔌', blurb: 'APIs, auth and data' },
        { name: 'Android Development', emoji: '📱', blurb: 'Kotlin apps' },
        { name: 'UX Design', emoji: '✏️', blurb: 'Design people enjoy' },
        { name: 'Full Stack', emoji: '🧱', blurb: 'End to end web apps' },
    ],
    'Systems & Cloud': [
        { name: 'DevOps', emoji: '♾️', blurb: 'Ship and operate software' },
        { name: 'Docker', emoji: '🐳', blurb: 'Containers from zero' },
        { name: 'Kubernetes', emoji: '☸️', blurb: 'Orchestrate at scale' },
        { name: 'AWS', emoji: '☁️', blurb: 'Core cloud services' },
        { name: 'System Design', emoji: '🏗️', blurb: 'Architect large systems' },
        { name: 'Linux', emoji: '🐧', blurb: 'The command line & OS' },
    ],
    'Security': [
        { name: 'Cybersecurity', emoji: '🛡️', blurb: 'Protect systems & data' },
        { name: 'Ethical Hacking', emoji: '🕵️', blurb: 'Think like an attacker' },
        { name: 'Cryptography', emoji: '🔐', blurb: 'Secrets, keys and proofs' },
        { name: 'Blockchain', emoji: '⛓️', blurb: 'Decentralized technology' },
    ],
    'Math & Science': [
        { name: 'Linear Algebra', emoji: '📐', blurb: 'Vectors, matrices, spaces' },
        { name: 'Calculus', emoji: '∫', blurb: 'Change and accumulation' },
        { name: 'Discrete Mathematics', emoji: '🔢', blurb: 'Logic, sets, graphs' },
        { name: 'Physics', emoji: '🪐', blurb: 'How the universe works' },
        { name: 'Data Structures & Algorithms', emoji: '🌲', blurb: 'Crack coding interviews' },
        { name: 'Quantum Computing', emoji: '⚛', blurb: 'Qubits and circuits' },
    ],
};
type Cat = keyof typeof CATALOG;

const STEPS = ['Looking for a curated roadmap…', 'Mapping prerequisites…', 'Ordering levels from basics to mastery…', 'Setting XP and quizzes…', 'Almost there…'];

const Generating: React.FC<{ topic: string }> = ({ topic }) => {
    const [i, setI] = useState(0);
    useEffect(() => { const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 2500); return () => clearInterval(t); }, []);
    return (
        <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/90 px-6 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="text-center">
                <motion.div animate={{ rotate: [0, 8, -8, 0], y: [0, -8, 0] }} transition={{ duration: 1.6, repeat: Infinity }}
                    className="mx-auto flex size-24 items-center justify-center rounded-[28px] bg-brand-500 text-white shadow-[0_8px_0_0_var(--color-brand-700)]">
                    <Wand2 className="size-11" />
                </motion.div>
                <h2 className="mt-8 text-2xl font-extrabold">Building “{topic}”</h2>
                <div className="mt-2 h-6 text-muted">
                    <AnimatePresence mode="wait"><motion.p key={i} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}>{STEPS[i]}</motion.p></AnimatePresence>
                </div>
                <div className="mx-auto mt-6 w-64"><ProgressBar value={((i + 1) / STEPS.length) * 90} /></div>
            </div>
        </motion.div>
    );
};

const CourseCard: React.FC<{ course: GeneratedRoadmap; index: number; active: boolean; onOpen: () => void; onDelete: () => void }> = ({ course, index, active, onOpen, onDelete }) => {
    const { progress } = useProgress();
    const [menu, setMenu] = useState(false);
    const rp = progress.roadmaps.find((p) => p.roadmapId === course.id);
    const done = course.levels.filter((l) => rp?.completedLevels.includes(l.id)).length;
    const pct = course.levels.length ? Math.round((done / course.levels.length) * 100) : 0;
    const c = UNIT_COLORS[index % UNIT_COLORS.length];
    const next = course.levels.find((l) => !rp?.completedLevels.includes(l.id));
    return (
        <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel panel-press group relative flex flex-col overflow-hidden" onClick={onOpen}>
            <div className={cn('relative h-28 overflow-hidden p-4 text-white', c.bg)}>
                <div className="dot-grid absolute inset-0 opacity-30 [--c-grid:rgb(255_255_255/0.5)]" />
                <span className="absolute -bottom-6 -right-3 font-display text-[110px] font-extrabold leading-none text-white/15">{course.topic[0]?.toUpperCase()}</span>
                <div className="relative flex items-start justify-between">
                    {active ? <Badge className="bg-white/25 text-white">Current</Badge> : <span />}
                    <button onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }} className="rounded-lg p-1 hover:bg-white/20"><MoreHorizontal className="size-5" /></button>
                </div>
                {pct === 100 && <div className="absolute bottom-3 left-4 flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold"><Check className="size-3" strokeWidth={4} /> Mastered</div>}
            </div>
            <AnimatePresence>
                {menu && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenu(false); }} />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.stopPropagation()}
                            className="panel absolute right-3 top-12 z-20 w-48 p-1.5">
                            <button onClick={() => { setMenu(false); onOpen(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-sunken"><Play className="size-4" /> Continue</button>
                            {course.source?.sourceUrl && <a href={course.source.sourceUrl} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-sunken"><ExternalLink className="size-4" /> View on roadmap.sh</a>}
                            <button onClick={() => { setMenu(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/10"><Trash2 className="size-4" /> Delete course</button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            <div className="flex flex-1 flex-col p-4">
                <h3 className="line-clamp-2 text-lg font-extrabold leading-snug">{course.topic}</h3>
                <p className="mt-1 line-clamp-1 text-sm text-muted">{next ? `Next: ${next.title}` : 'All levels complete'}</p>
                <div className="mt-auto pt-4">
                    <div className="mb-1.5 flex justify-between text-xs font-bold text-subtle"><span>{done}/{course.levels.length} levels</span><span>{pct}%</span></div>
                    <ProgressBar value={pct} tone={pct === 100 ? 'success' : 'brand'} size="sm" />
                    <div className="mt-3 flex items-center justify-between text-xs text-subtle">
                        <span className="flex items-center gap-1">{course.source?.source === 'roadmap.sh' ? <><BookOpen className="size-3.5" /> roadmap.sh</> : <><Sparkles className="size-3.5" /> AI-built</>}</span>
                        <span>{timeAgo(course.createdAt)}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const Courses: React.FC = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { roadmaps, loading, loaded } = useRoadmaps();
    const activeId = useActiveCourseId();
    const [query, setQuery] = useState('');
    const [cat, setCat] = useState<Cat>('Programming');
    const [generating, setGenerating] = useState<string | null>(null);
    const [confirmNode, confirm] = useConfirm();

    useEffect(() => { roadmapStore.load(); }, []);

    const openCourse = (c: GeneratedRoadmap) => { setActiveCourse(c.id); navigate('/learn'); };

    const create = useCallback(async (topic: string) => {
        topic = topic.trim().slice(0, 200);
        if (!topic || generating) return;
        setGenerating(topic);
        try {
            const userId = progressService.getDbUserId();
            if (userId) {
                const check = await api.checkRoadmapExists(userId, topic).catch(() => null);
                if (check?.exists && check.roadmap) {
                    const existing = toRoadmap(check.roadmap);
                    roadmapStore.upsert(existing);
                    toast.info(`You already have “${existing.topic}” — opening it.`);
                    openCourse(existing);
                    return;
                }
            }
            const resolved = await api.resolveRoadmap(topic);
            const levels: RoadmapLevel[] = resolved.roadmap.levels;
            const source: RoadmapSource = { source: resolved.roadmap.source, sourceSlug: resolved.roadmap.sourceSlug, sourceUrl: resolved.roadmap.sourceUrl, sourceProvider: resolved.roadmap.sourceProvider };
            const saved = await api.createRoadmap({ topic, levels, source });
            const course = { ...toRoadmap(saved), source: saved.source || source };
            roadmapStore.upsert(course);
            toast.success(`“${course.topic}” is ready`, { description: `${course.levels.length} levels on your path.` });
            openCourse(course);
        } catch (err: any) {
            toast.error('Couldn’t build that course', { description: err?.message || 'Please try again.' });
        } finally {
            setGenerating(null);
        }
    }, [generating]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const t = params.get('new') || params.get('learn');
        if (t) { setParams({}, { replace: true }); create(t); }
    }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

    const remove = async (c: GeneratedRoadmap) => {
        const ok = await confirm({ title: `Delete “${c.topic}”?`, description: 'Its lessons, quizzes and progress are removed. XP you earned stays.', confirmLabel: 'Delete course', danger: true });
        if (!ok) return;
        try {
            if (c.dbId) await api.deleteRoadmap(c.dbId);
            roadmapStore.remove(c.id);
            if (activeId === c.id) setActiveCourse(null);
            toast.success('Course deleted');
        } catch (err: any) { toast.error('Delete failed', { description: err?.message }); }
    };

    const mine = roadmaps.map((r) => r.topic.toLowerCase());

    return (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
            {confirmNode}
            {/* hero */}
            <section className="relative overflow-hidden rounded-[28px] bg-brand-500 px-6 py-10 text-white shadow-[0_6px_0_0_var(--color-brand-700)] sm:px-12 sm:py-14">
                <div className="dot-grid absolute inset-0 opacity-40 [--c-grid:rgb(255_255_255/0.35)]" />
                <div className="absolute -right-10 -top-10 size-64 rounded-full bg-lime-brand/30 blur-3xl" />
                <div className="relative max-w-2xl">
                    <h1 className="text-3xl font-extrabold sm:text-5xl">What do you want to learn?</h1>
                    <p className="mt-3 text-base text-white/80 sm:text-lg">Any topic becomes a course: levels, lessons, deep dives and quizzes. Curated by roadmap.sh when it exists, built by AI when it doesn’t.</p>
                    <form onSubmit={(e) => { e.preventDefault(); create(query); }} className="mt-7 flex flex-col gap-2 sm:flex-row">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-subtle" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} placeholder="Try “Graph theory”, “Kotlin”, “Microeconomics”…"
                                className="h-14 w-full rounded-2xl border-2 border-transparent bg-white pl-12 pr-4 text-base font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-lime-brand" />
                        </div>
                        <Button type="submit" size="xl" className="bg-lime-brand text-zinc-900 shadow-[0_4px_0_0_#5e9c2c] hover:brightness-105 active:translate-y-[4px] active:shadow-none" disabled={!query.trim()}>
                            Create course <ArrowRight className="size-5" />
                        </Button>
                    </form>
                </div>
            </section>

            {/* my courses */}
            <section className="mt-12">
                <div className="mb-4 flex items-end justify-between">
                    <div><h2 className="text-2xl font-extrabold">My courses</h2><p className="text-sm text-muted">Pick one to put it on your Learn path.</p></div>
                </div>
                {!loaded && loading && roadmaps.length === 0 ? (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-64" />)}</div>
                ) : roadmaps.length === 0 ? (
                    <div className="panel flex flex-col items-center gap-2 border-dashed p-10 text-center">
                        <Sparkles className="size-8 text-brand-500" />
                        <p className="font-bold">No courses yet</p>
                        <p className="text-sm text-muted">Search above or pick a topic below to start.</p>
                    </div>
                ) : (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {roadmaps.map((c, i) => (
                            <CourseCard key={c.id} course={c} index={i} active={c.id === (activeId || roadmaps[0]?.id)} onOpen={() => openCourse(c)} onDelete={() => remove(c)} />
                        ))}
                    </div>
                )}
            </section>

            {/* explore */}
            <section className="mt-14">
                <h2 className="text-2xl font-extrabold">Explore topics</h2>
                <p className="mb-4 text-sm text-muted">One click builds a full course.</p>
                <Tabs<Cat> value={cat} onChange={setCat} className="mb-5 overflow-x-auto" options={(Object.keys(CATALOG) as Cat[]).map((k) => ({ value: k, label: k }))} />
                <motion.div key={cat} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {CATALOG[cat].map((t) => {
                        const have = mine.includes(t.name.toLowerCase());
                        return (
                            <motion.button key={t.name} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                                onClick={() => (have ? openCourse(roadmaps.find((r) => r.topic.toLowerCase() === t.name.toLowerCase())!) : create(t.name))}
                                className="panel panel-press flex items-center gap-4 p-4 text-left">
                                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-sunken text-3xl">{t.emoji}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-extrabold">{t.name}</div>
                                    <div className="truncate text-sm text-muted">{t.blurb}</div>
                                </div>
                                {have ? <Badge tone="success" icon={<Check className="size-3" />}>Added</Badge> : <Zap className="size-5 text-subtle" />}
                            </motion.button>
                        );
                    })}
                </motion.div>
            </section>

            <AnimatePresence>{generating && <Generating topic={generating} />}</AnimatePresence>
        </div>
    );
};

export default Courses;
