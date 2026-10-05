import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
    BookOpen, Check, ChevronDown, Crown, Dumbbell, Layers, Lock, NotebookText, Plus, Sparkles, Star, Trophy,
} from 'lucide-react';
import { GeneratedRoadmap, RoadmapLevel } from '../types';
import { useProgress } from '../services/progressService';
import { roadmapStore, useRoadmaps } from '../services/roadmapStore';
import { setActiveCourse, useActiveCourseId } from '../lib/activeCourse';
import { getLessonStage } from '../lib/lessonProgress';
import { cn } from '../lib/cn';
import { Badge, Button, Card, Modal, ProgressBar } from '../ui';
import { QuestsWidget, RightRail } from '../widgets';

export const UNIT_COLORS = [
    { bg: 'bg-brand-500', shadow: '#4730c9', text: 'text-brand-500', soft: 'bg-brand-500/12', hex: '#6c56ff' },
    { bg: 'bg-emerald-500', shadow: '#047857', text: 'text-emerald-500', soft: 'bg-emerald-500/12', hex: '#10b981' },
    { bg: 'bg-sky-500', shadow: '#0369a1', text: 'text-sky-500', soft: 'bg-sky-500/12', hex: '#0ea5e9' },
    { bg: 'bg-pink-500', shadow: '#be185d', text: 'text-pink-500', soft: 'bg-pink-500/12', hex: '#ec4899' },
    { bg: 'bg-amber-500', shadow: '#b45309', text: 'text-amber-500', soft: 'bg-amber-500/12', hex: '#f59e0b' },
    { bg: 'bg-violet-500', shadow: '#6d28d9', text: 'text-violet-500', soft: 'bg-violet-500/12', hex: '#8b5cf6' },
];
const OFFSETS = [0, 52, 78, 52, 0, -52, -78, -52];

type NodeKind = 'overview' | 'deep' | 'quiz';
const NODE_META: Record<NodeKind, { icon: React.ComponentType<any>; label: string }> = {
    overview: { icon: BookOpen, label: 'Lesson' },
    deep: { icon: Layers, label: 'Deep dive' },
    quiz: { icon: Dumbbell, label: 'Quiz' },
};

const subtopicLabel = (s: any): string => (typeof s === 'string' ? s : s?.title || '');

interface PathNode { level: RoadmapLevel; levelIdx: number; kind: NodeKind; state: 'done' | 'current' | 'locked' | 'open'; label: string; }

function buildNodes(course: GeneratedRoadmap, completed: Set<string>): PathNode[] {
    const nodes: PathNode[] = [];
    let currentFound = false;
    course.levels.forEach((level, levelIdx) => {
        const levelDone = completed.has(level.id);
        const unlocked = levelIdx === 0 || completed.has(course.levels[levelIdx - 1].id);
        const stage = getLessonStage(course.id, level.id);
        (['overview', 'deep', 'quiz'] as NodeKind[]).forEach((kind) => {
            let state: PathNode['state'];
            if (levelDone) state = 'done';
            else if (!unlocked) state = 'locked';
            else if (kind === 'overview' && (stage === 'deep' || stage === 'quiz')) state = 'done';
            else if (kind === 'deep' && stage === 'quiz') state = 'done';
            else state = 'open';
            if (state === 'open' && !currentFound) { state = 'current'; currentFound = true; }
            const label = kind === 'quiz' ? 'Quiz time' : kind === 'overview' && stage === 'none' ? 'Start' : 'Continue';
            nodes.push({ level, levelIdx, kind, state, label });
        });
    });
    return nodes;
}

const PathNodeButton: React.FC<{ node: PathNode; offset: number; color: typeof UNIT_COLORS[0]; onOpen: () => void; anchorRef?: React.Ref<HTMLDivElement> }> = ({ node, offset, color, onOpen, anchorRef }) => {
    const Icon = node.state === 'done' ? Check : node.state === 'locked' ? Lock : node.kind === 'quiz' ? Trophy : node.state === 'current' ? Star : NODE_META[node.kind].icon;
    const active = node.state === 'current';
    return (
        <div ref={anchorRef} className="relative flex justify-center" style={{ transform: `translateX(${offset}px)` }}>
            {active && (
                <motion.div
                    className="absolute -top-12 z-10 whitespace-nowrap rounded-xl border-2 border-line bg-surface px-3 py-1.5 font-display text-sm font-extrabold uppercase tracking-wide"
                    style={{ color: color.hex }}
                    animate={{ y: [0, -5, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                >
                    {node.label}
                    <span className="absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-line bg-surface" />
                </motion.div>
            )}
            {active && <span className="absolute size-[92px] rounded-full border-[6px] opacity-25" style={{ borderColor: color.hex }} />}
            <button
                onClick={onOpen}
                disabled={node.state === 'locked'}
                title={`${NODE_META[node.kind].label} · ${node.level.title}`}
                className={cn(
                    'relative flex size-[72px] items-center justify-center rounded-full transition-transform active:translate-y-[6px]',
                    node.state === 'locked' ? 'cursor-not-allowed bg-line text-subtle' : node.state === 'done' ? 'bg-amber-400 text-white' : `${color.bg} text-white`,
                )}
                style={{
                    boxShadow: node.state === 'locked' ? '0 6px 0 0 var(--c-line-strong)' : `0 6px 0 0 ${node.state === 'done' ? '#d97706' : color.shadow}`,
                }}
            >
                <span className="absolute left-3 top-2.5 h-3 w-5 rotate-[-25deg] rounded-full bg-white/30" />
                <Icon className="size-8" strokeWidth={node.state === 'done' ? 4 : 2.6} fill={Icon === Star ? 'currentColor' : 'none'} />
            </button>
        </div>
    );
};

const EmptyLearn: React.FC = () => {
    const navigate = useNavigate();
    const [topic, setTopic] = useState('');
    const ideas = ['Python', 'Machine Learning', 'React', 'SQL', 'System Design', 'Cybersecurity'];
    return (
        <Card className="dot-grid overflow-hidden p-8 text-center sm:p-12">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.4, repeat: Infinity }} className="mx-auto flex size-24 items-center justify-center rounded-[28px] bg-brand-500 text-white shadow-[0_8px_0_0_var(--color-brand-700)]">
                <Sparkles className="size-12" />
            </motion.div>
            <h1 className="mt-8 text-3xl font-extrabold sm:text-4xl">Start your first course</h1>
            <p className="mx-auto mt-2 max-w-md text-muted">Name anything you want to learn. Cognify builds a path of levels, writes every lesson and quizzes you as you go.</p>
            <form onSubmit={(e) => { e.preventDefault(); if (topic.trim()) navigate(`/courses?new=${encodeURIComponent(topic.trim())}`); }} className="mx-auto mt-8 flex max-w-md gap-2">
                <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Linear algebra" className="input h-12 text-base" />
                <Button variant="primary" size="lg" type="submit" disabled={!topic.trim()}>Go</Button>
            </form>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
                {ideas.map((i) => (
                    <button key={i} onClick={() => navigate(`/courses?new=${encodeURIComponent(i)}`)} className="rounded-full border-2 border-line bg-surface px-3.5 py-1.5 text-sm font-bold text-muted hover:border-brand-300 hover:text-brand-600">{i}</button>
                ))}
            </div>
        </Card>
    );
};

const Learn: React.FC = () => {
    const navigate = useNavigate();
    const { roadmaps, loaded, loading } = useRoadmaps();
    const { progress } = useProgress();
    const activeId = useActiveCourseId();
    const [switcher, setSwitcher] = useState(false);
    const [guide, setGuide] = useState<RoadmapLevel | 'all' | null>(null);
    const currentRef = useRef<HTMLDivElement>(null);
    const scrolled = useRef(false);

    useEffect(() => { roadmapStore.load(); }, []);

    const course = roadmaps.find((r) => r.id === activeId) || roadmaps[0] || null;
    const completed = useMemo(() => new Set(progress.roadmaps.find((r) => r.roadmapId === course?.id)?.completedLevels || []), [progress, course?.id]);
    const nodes = useMemo(() => (course ? buildNodes(course, completed) : []), [course, completed]);
    const doneLevels = course ? course.levels.filter((l) => completed.has(l.id)).length : 0;
    const currentNode = nodes.find((n) => n.state === 'current');
    const allDone = !!course && doneLevels === course.levels.length && course.levels.length > 0;

    useEffect(() => {
        if (!scrolled.current && currentRef.current) {
            scrolled.current = true;
            setTimeout(() => currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
        }
    }, [nodes.length]);

    const openNode = (n: PathNode) => {
        if (!course || n.state === 'locked') return;
        navigate(`/lesson/${course.id}/${encodeURIComponent(n.level.id)}?at=${n.kind}`);
    };

    if (!loaded && loading && roadmaps.length === 0) {
        return <div className="mx-auto max-w-[640px] space-y-6 px-4 py-8">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24" />)}</div>;
    }

    return (
        <div className="mx-auto flex max-w-[1180px] gap-10 px-4 py-6 sm:px-6 lg:py-8">
            <div className="mx-auto w-full max-w-[600px] min-w-0">
                {!course ? <EmptyLearn /> : (
                    <>
                        {/* course header */}
                        <div className="sticky top-[74px] z-20 mb-6">
                            <div className="relative flex items-center gap-3 rounded-2xl bg-brand-500 p-4 text-white shadow-[0_5px_0_0_var(--color-brand-700)]">
                                <button onClick={() => setSwitcher((s) => !s)} className="min-w-0 flex-1 text-left">
                                    <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-white/75">
                                        Course · {doneLevels}/{course.levels.length} levels <ChevronDown className={cn('size-4 transition', switcher && 'rotate-180')} />
                                    </div>
                                    <div className="truncate font-display text-xl font-extrabold">{course.topic}</div>
                                </button>
                                <button onClick={() => setGuide('all')} className="flex shrink-0 items-center gap-2 rounded-xl border-2 border-white/30 px-3 py-2 text-sm font-extrabold uppercase tracking-wide hover:bg-white/10">
                                    <NotebookText className="size-5" /> <span className="hidden sm:inline">Guidebook</span>
                                </button>
                                <AnimatePresence>
                                    {switcher && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setSwitcher(false)} />
                                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                                className="panel absolute left-0 right-0 top-[calc(100%+12px)] z-20 max-h-[60vh] overflow-y-auto p-2 text-ink">
                                                <div className="eyebrow px-3 py-2">My courses</div>
                                                {roadmaps.map((r, i) => {
                                                    const rp = progress.roadmaps.find((p) => p.roadmapId === r.id);
                                                    const d = r.levels.filter((l) => rp?.completedLevels.includes(l.id)).length;
                                                    const c = UNIT_COLORS[i % UNIT_COLORS.length];
                                                    return (
                                                        <button key={r.id} onClick={() => { setActiveCourse(r.id); setSwitcher(false); scrolled.current = false; }}
                                                            className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-sunken', r.id === course.id && 'bg-brand-500/10')}>
                                                            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl font-display text-lg font-extrabold text-white', c.bg)}>{r.topic[0]?.toUpperCase()}</span>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate font-bold">{r.topic}</div>
                                                                <ProgressBar value={(d / (r.levels.length || 1)) * 100} size="sm" className="mt-1.5" />
                                                            </div>
                                                            <span className="text-xs font-bold text-subtle">{d}/{r.levels.length}</span>
                                                        </button>
                                                    );
                                                })}
                                                <Link to="/courses" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-brand-600 hover:bg-sunken dark:text-brand-300">
                                                    <span className="flex size-10 items-center justify-center rounded-xl border-2 border-dashed border-brand-300"><Plus className="size-5" /></span> Add a course
                                                </Link>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className="mb-6 xl:hidden"><QuestsWidget /></div>

                        {/* path */}
                        <div className="pb-10">
                            {course.levels.map((level, li) => {
                                const color = UNIT_COLORS[li % UNIT_COLORS.length];
                                const levelNodes = nodes.filter((n) => n.levelIdx === li);
                                const locked = levelNodes.every((n) => n.state === 'locked');
                                return (
                                    <section key={level.id} className="mb-6">
                                        <div className={cn('mb-12 flex items-center gap-3 rounded-2xl p-4', locked ? 'bg-sunken text-muted' : `${color.bg} text-white`)}
                                            style={locked ? undefined : { boxShadow: `0 5px 0 0 ${color.shadow}` }}>
                                            <div className="min-w-0 flex-1">
                                                <div className={cn('text-[12px] font-extrabold uppercase tracking-wider', locked ? 'text-subtle' : 'text-white/75')}>Level {li + 1} · {level.xpReward} XP</div>
                                                <h2 className="mt-0.5 font-display text-lg font-extrabold leading-tight">{level.title}</h2>
                                            </div>
                                            <button onClick={() => setGuide(level)} className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl border-2', locked ? 'border-line' : 'border-white/30 hover:bg-white/10')} title="Level guide">
                                                <NotebookText className="size-5" />
                                            </button>
                                        </div>
                                        <div className="space-y-9">
                                            {levelNodes.map((n, ni) => (
                                                <PathNodeButton
                                                    key={n.kind}
                                                    node={n}
                                                    color={color}
                                                    offset={OFFSETS[(li * 3 + ni) % OFFSETS.length]}
                                                    onOpen={() => openNode(n)}
                                                    anchorRef={n === currentNode ? currentRef : undefined}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}

                            {/* finish line */}
                            <div className="mt-14 flex flex-col items-center text-center">
                                <div className={cn('flex size-24 items-center justify-center rounded-full', allDone ? 'bg-amber-400 text-white shadow-[0_7px_0_0_#d97706]' : 'bg-line text-subtle shadow-[0_7px_0_0_var(--c-line-strong)]')}>
                                    <Crown className="size-11" />
                                </div>
                                <p className="mt-5 font-display text-lg font-extrabold">{allDone ? `You mastered ${course.topic}!` : 'Course mastery'}</p>
                                <p className="text-sm text-muted">{allDone ? 'Pick a new course to keep learning.' : 'Complete every level to earn the crown.'}</p>
                                {allDone && <Link to="/courses" className="mt-4"><Button variant="primary">Find a new course</Button></Link>}
                            </div>
                        </div>
                    </>
                )}
            </div>
            <RightRail />

            <Modal open={!!guide} onClose={() => setGuide(null)} className="max-w-xl"
                title={guide === 'all' ? `${course?.topic} guidebook` : (guide as RoadmapLevel)?.title}
                description={guide === 'all' ? 'Every level in this course and what it covers.' : (guide as RoadmapLevel)?.description}>
                <div className="-mx-2 max-h-[60vh] space-y-3 overflow-y-auto px-2">
                    {(guide === 'all' ? course?.levels || [] : guide ? [guide] : []).map((l) => {
                        const i = course?.levels.findIndex((x) => x.id === l.id) ?? 0;
                        const subs = ((l.subtopics as any[]) || []).map(subtopicLabel).filter(Boolean);
                        return (
                            <div key={l.id} className="rounded-2xl border-2 border-line p-4">
                                {guide === 'all' && (
                                    <div className="flex items-start justify-between gap-2">
                                        <div><div className="eyebrow">Level {i + 1}</div><div className="font-bold">{l.title}</div></div>
                                        {completed.has(l.id) ? <Badge tone="success" icon={<Check className="size-3" />}>Done</Badge> : <Badge tone="warning">{l.xpReward} XP</Badge>}
                                    </div>
                                )}
                                {guide === 'all' && l.description && <p className="mt-1 text-sm text-muted">{l.description}</p>}
                                {subs.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {subs.slice(0, guide === 'all' ? 8 : 40).map((s, k) => <span key={k} className="rounded-lg bg-sunken px-2 py-1 text-xs font-semibold text-muted">{s}</span>)}
                                        {guide === 'all' && subs.length > 8 && <span className="px-1 py-1 text-xs font-semibold text-subtle">+{subs.length - 8}</span>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {course?.source?.source === 'roadmap.sh' && (
                        <p className="text-xs text-subtle">Curriculum from <a href={course.source.sourceUrl || 'https://roadmap.sh'} target="_blank" rel="noreferrer" className="font-bold underline">roadmap.sh</a>.</p>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default Learn;
