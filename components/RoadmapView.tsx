import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
    ArrowLeft, ArrowRight, BookOpen, Check, Clock, Crown, ExternalLink, Flame, Layers, Lock, Map, Plus,
    Rocket, Search, Sprout, Trash2, Zap,
} from 'lucide-react';
import { GeneratedRoadmap, RoadmapLevel, RoadmapSource } from '../types';
import { progressService, useProgress } from '../services/progressService';
import { roadmapStore, toRoadmap, useRoadmaps } from '../services/roadmapStore';
import * as api from '../services/apiService';
import TopicSelector, { GeneratingOverlay } from './TopicSelector';
import LevelView from './LevelView';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, ProgressRing, stagger } from './ui';
import { useConfirm } from './ui/useConfirm';
import { cn } from '../lib/cn';
import { timeAgo } from '../lib/format';

type ViewState = 'topic-select' | 'roadmap' | 'level';

const subtopicLabel = (s: any): string => (typeof s === 'string' ? s : s?.title || '');

const SourceBadge: React.FC<{ source?: RoadmapSource | null }> = ({ source }) => {
    if (source?.source === 'roadmap.sh') {
        return (
            <a href={source.sourceUrl || 'https://roadmap.sh'} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <Badge tone="success" icon={<BookOpen className="size-3" />}>roadmap.sh <ExternalLink className="size-2.5" /></Badge>
            </a>
        );
    }
    if (source?.source === 'ai') return <Badge tone="brand" icon={<Zap className="size-3" />}>AI-generated</Badge>;
    return null;
};

const RoadmapView: React.FC = () => {
    const [params, setParams] = useSearchParams();
    const { roadmaps, loading: loadingHistory, loaded } = useRoadmaps();
    const { progress } = useProgress();
    const [viewState, setViewState] = useState<ViewState>('topic-select');
    const [currentRoadmap, setCurrentRoadmap] = useState<GeneratedRoadmap | null>(null);
    const [currentLevel, setCurrentLevel] = useState<RoadmapLevel | null>(null);
    const [generatingTopic, setGeneratingTopic] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const [confirmNode, confirm] = useConfirm();

    useEffect(() => { roadmapStore.load(); }, []);

    const openRoadmap = useCallback((roadmap: GeneratedRoadmap) => {
        setCurrentRoadmap(roadmap);
        setCurrentLevel(null);
        setViewState('roadmap');
    }, []);

    const handleGenerate = useCallback(async (topic: string) => {
        if (generatingTopic) return;
        setGeneratingTopic(topic);
        try {
            const userId = progressService.getDbUserId();

            // 1. Reuse an existing roadmap for the same topic.
            if (userId) {
                try {
                    const check = await api.checkRoadmapExists(userId, topic);
                    if (check.exists && check.roadmap) {
                        const existing = toRoadmap(check.roadmap);
                        roadmapStore.upsert(existing);
                        openRoadmap(existing);
                        toast.info(`You already have a roadmap for “${existing.topic}”.`);
                        return;
                    }
                } catch (err) {
                    console.warn('Existing-roadmap check failed:', err);
                }
            }

            // 2. Resolve: roadmap.sh first, AI fallback — same shape either way.
            const resolved = await api.resolveRoadmap(topic);
            const levels: RoadmapLevel[] = resolved.roadmap.levels;
            const source: RoadmapSource = {
                source: resolved.roadmap.source,
                sourceSlug: resolved.roadmap.sourceSlug,
                sourceUrl: resolved.roadmap.sourceUrl,
                sourceProvider: resolved.roadmap.sourceProvider,
            };

            // 3. Save.
            let created: GeneratedRoadmap;
            if (userId) {
                const saved = await api.createRoadmap({ topic, levels, source });
                created = { ...toRoadmap(saved), source: saved.source || source };
            } else {
                created = { id: crypto.randomUUID(), topic, levels, createdAt: new Date().toISOString(), source };
            }
            roadmapStore.upsert(created);
            openRoadmap(created);
            toast.success(`Your ${created.topic} roadmap is ready`, { description: `${created.levels.length} levels to go.` });
        } catch (error: any) {
            console.error('Generation failed:', error);
            toast.error('Couldn’t build that roadmap', { description: error?.message || 'Please try again in a moment.' });
        } finally {
            setGeneratingTopic(null);
        }
    }, [generatingTopic, openRoadmap]);

    // Deep links: /roadmap?learn=<topic> builds one, /roadmap?open=<id> opens one.
    useEffect(() => {
        const learn = params.get('learn');
        const open = params.get('open');
        if (learn) {
            setParams({}, { replace: true });
            handleGenerate(learn);
        } else if (open) {
            const found = roadmaps.find((r) => r.id === open);
            if (found) {
                setParams({}, { replace: true });
                openRoadmap(found);
            } else if (loaded) {
                setParams({}, { replace: true });
            }
        }
    }, [params, roadmaps, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDeleteRoadmap = async (e: React.MouseEvent, roadmap: GeneratedRoadmap) => {
        e.stopPropagation();
        const ok = await confirm({
            title: `Delete “${roadmap.topic}”?`,
            description: 'Its lessons, quizzes and progress for this path will be removed. XP you already earned stays.',
            confirmLabel: 'Delete roadmap',
            danger: true,
        });
        if (!ok) return;
        if (roadmap.dbId) {
            try {
                await api.deleteRoadmap(roadmap.dbId);
            } catch (err: any) {
                toast.error('Delete failed', { description: err?.message });
                return;
            }
        }
        roadmapStore.remove(roadmap.id);
        if (currentRoadmap?.id === roadmap.id) {
            setViewState('topic-select');
            setCurrentRoadmap(null);
        }
        toast.success('Roadmap deleted');
    };

    const handleNextLevel = useCallback(() => {
        if (!currentRoadmap || !currentLevel) return;
        const idx = currentRoadmap.levels.findIndex((l) => l.id === currentLevel.id);
        if (idx >= 0 && idx < currentRoadmap.levels.length - 1) {
            setCurrentLevel(currentRoadmap.levels[idx + 1]);
        } else {
            setViewState('roadmap');
            setCurrentLevel(null);
        }
    }, [currentRoadmap, currentLevel]);

    const handleBack = useCallback(() => {
        if (viewState === 'level') {
            setCurrentLevel(null);
            setViewState('roadmap');
        } else {
            setViewState('topic-select');
        }
    }, [viewState]);

    useEffect(() => {
        if ((viewState === 'roadmap' || viewState === 'level') && !currentRoadmap) {
            setViewState('topic-select');
            setCurrentLevel(null);
        }
    }, [viewState, currentRoadmap]);

    // ── Level ──
    if (viewState === 'level' && currentLevel && currentRoadmap) {
        const idx = currentRoadmap.levels.findIndex((l) => l.id === currentLevel.id);
        return (
            <LevelView
                key={currentLevel.id}
                level={currentLevel}
                levelNumber={idx + 1}
                totalLevels={currentRoadmap.levels.length}
                roadmapId={currentRoadmap.id}
                roadmapDbId={currentRoadmap.dbId}
                topic={currentRoadmap.topic}
                onBack={handleBack}
                onNext={handleNextLevel}
                isLastLevel={idx === currentRoadmap.levels.length - 1}
            />
        );
    }

    // ── Roadmap detail ──
    if (viewState === 'roadmap' && currentRoadmap) {
        const rp = progress.roadmaps.find((r) => r.roadmapId === currentRoadmap.id);
        const completed = new Set(rp?.completedLevels || []);
        const total = currentRoadmap.levels.length;
        const done = currentRoadmap.levels.filter((l) => completed.has(l.id)).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const totalXp = currentRoadmap.levels.reduce((s, l) => s + (l.xpReward || 0), 0);
        const nextIdx = currentRoadmap.levels.findIndex((l) => !completed.has(l.id));

        return (
            <div>
                {confirmNode}
                <button onClick={handleBack} className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition hover:text-ink">
                    <ArrowLeft className="size-4" /> All roadmaps
                </button>

                <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
                    <div className="min-w-0">
                        <div className="mb-8">
                            <div className="flex flex-wrap items-center gap-2">
                                <SourceBadge source={currentRoadmap.source} />
                                <Badge>{total} levels</Badge>
                                {pct === 100 && <Badge tone="success" icon={<Crown className="size-3" />}>Mastered</Badge>}
                            </div>
                            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{currentRoadmap.topic}</h1>
                            <p className="mt-2 text-muted">Complete a level’s quiz to unlock the next one.</p>
                            {nextIdx >= 0 && (
                                <Button variant="primary" className="mt-5" onClick={() => { setCurrentLevel(currentRoadmap.levels[nextIdx]); setViewState('level'); }}>
                                    {done === 0 ? 'Start level 1' : `Continue · Level ${nextIdx + 1}`} <ArrowRight className="size-4" />
                                </Button>
                            )}
                        </div>

                        {/* path */}
                        <motion.ol variants={stagger.container} initial="hidden" animate="show" className="relative space-y-4">
                            <div className="absolute bottom-6 left-[19px] top-6 w-0.5 rounded-full bg-line" />
                            <motion.div
                                className="absolute left-[19px] top-6 w-0.5 rounded-full bg-gradient-to-b from-emerald-400 to-brand-400"
                                initial={{ height: 0 }}
                                animate={{ height: `${total ? (done / total) * 100 : 0}%` }}
                                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                            />
                            {currentRoadmap.levels.map((level, index) => {
                                const isCompleted = completed.has(level.id);
                                const isLocked = index > 0 && !completed.has(currentRoadmap.levels[index - 1].id);
                                const isCurrent = !isCompleted && !isLocked;
                                const subs = (level.subtopics || []).map(subtopicLabel).filter(Boolean);
                                return (
                                    <motion.li key={level.id} variants={stagger.item} className="relative flex gap-4">
                                        <div className={cn(
                                            'relative z-10 mt-4 flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition',
                                            isCompleted && 'border-emerald-400 bg-emerald-400 text-white shadow-[0_0_20px_-2px_rgb(52_211_153/0.6)]',
                                            isCurrent && 'border-brand-400 bg-bg text-brand-500 shadow-[0_0_24px_-2px_rgb(124_92_255/0.6)]',
                                            isLocked && 'border-line-strong bg-bg text-subtle',
                                        )}>
                                            {isCompleted ? <Check className="size-5" strokeWidth={3} /> : isLocked ? <Lock className="size-4" /> : index + 1}
                                            {isCurrent && <span className="absolute inset-0 animate-ping rounded-full border-2 border-brand-400/50" />}
                                        </div>
                                        <button
                                            disabled={isLocked}
                                            onClick={() => { setCurrentLevel(level); setViewState('level'); }}
                                            className={cn(
                                                'card group min-w-0 flex-1 p-5 text-left transition',
                                                isLocked ? 'cursor-not-allowed opacity-55' : 'card-hover',
                                                isCurrent && 'border-brand-500/40',
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className={cn('eyebrow', isCurrent && 'text-brand-500', isCompleted && 'text-emerald-500')}>
                                                        Level {index + 1}{isCurrent ? ' · Up next' : isCompleted ? ' · Complete' : ''}
                                                    </div>
                                                    <h3 className="mt-1.5 text-lg font-semibold tracking-tight">{level.title}</h3>
                                                    {level.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{level.description}</p>}
                                                </div>
                                                <Badge tone={isCompleted ? 'success' : 'warning'} icon={<Zap className="size-3" />} className="shrink-0">{level.xpReward} XP</Badge>
                                            </div>
                                            {subs.length > 0 && (
                                                <div className="mt-4 flex flex-wrap gap-1.5">
                                                    {subs.slice(0, 5).map((s, i) => (
                                                        <span key={i} className="rounded-lg border border-line bg-sunken/70 px-2 py-0.5 text-xs text-muted">{s}</span>
                                                    ))}
                                                    {subs.length > 5 && <span className="px-1 py-0.5 text-xs text-subtle">+{subs.length - 5} more</span>}
                                                </div>
                                            )}
                                        </button>
                                    </motion.li>
                                );
                            })}
                        </motion.ol>
                    </div>

                    {/* side panel */}
                    <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                        <Card className="flex flex-col items-center p-6 text-center">
                            <ProgressRing value={pct} size={140} stroke={12}>
                                <div className="text-3xl font-semibold tracking-tight">{pct}%</div>
                                <div className="text-[11px] text-subtle">complete</div>
                            </ProgressRing>
                            <div className="mt-4 text-sm text-muted"><b className="text-ink">{done}</b> of {total} levels done</div>
                        </Card>

                        <Card className="p-5">
                            <h3 className="eyebrow mb-4">At a glance</h3>
                            <dl className="space-y-3 text-sm">
                                {[
                                    { icon: Clock, label: 'Est. time', value: `${Math.round(total * 25 / 60 * 10) / 10} h`, tone: 'text-sky-500' },
                                    { icon: Zap, label: 'Total XP', value: totalXp.toLocaleString(), tone: 'text-amber-500' },
                                    { icon: Layers, label: 'Difficulty', value: total <= 4 ? 'Beginner' : total <= 7 ? 'Intermediate' : 'Advanced', tone: 'text-brand-500' },
                                    { icon: Map, label: 'Created', value: timeAgo(currentRoadmap.createdAt), tone: 'text-emerald-500' },
                                ].map((r) => (
                                    <div key={r.label} className="flex items-center justify-between">
                                        <dt className="flex items-center gap-2 text-muted"><r.icon className={cn('size-4', r.tone)} />{r.label}</dt>
                                        <dd className="font-semibold">{r.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </Card>

                        <Card className="p-5">
                            <h3 className="eyebrow mb-4">Milestones</h3>
                            <div className="space-y-2">
                                {[
                                    { p: 25, label: 'Getting started', icon: Sprout },
                                    { p: 50, label: 'Halfway there', icon: Flame },
                                    { p: 75, label: 'Almost done', icon: Rocket },
                                    { p: 100, label: 'Mastered', icon: Crown },
                                ].map((m) => {
                                    const reached = pct >= m.p;
                                    return (
                                        <div key={m.p} className={cn('flex items-center gap-3 rounded-xl p-2 transition', reached ? 'bg-emerald-500/10' : 'opacity-50')}>
                                            <div className={cn('flex size-8 items-center justify-center rounded-lg', reached ? 'bg-emerald-500 text-white' : 'bg-sunken text-subtle')}>
                                                <m.icon className="size-4" />
                                            </div>
                                            <div className="flex-1 text-sm font-medium">{m.label}</div>
                                            <span className="text-xs text-subtle">{m.p}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        <Button variant="ghost" className="w-full text-red-500 hover:bg-red-500/10 hover:text-red-500" icon={<Trash2 className="size-4" />} onClick={(e) => handleDeleteRoadmap(e, currentRoadmap)}>
                            Delete roadmap
                        </Button>
                    </aside>
                </div>
                {generatingTopic && <GeneratingOverlay topic={generatingTopic} />}
            </div>
        );
    }

    // ── Topic select + library ──
    const shown = roadmaps.filter((r) => r.topic.toLowerCase().includes(filter.toLowerCase()));
    return (
        <div>
            {confirmNode}
            <TopicSelector onSelectTopic={handleGenerate} isLoading={!!generatingTopic} loadingTopic={generatingTopic || undefined} />

            <div className="mt-14">
                <PageHeader
                    className="mb-5"
                    title={<span className="text-xl sm:text-2xl">Your learning paths</span>}
                    description={roadmaps.length ? `${roadmaps.length} roadmap${roadmaps.length === 1 ? '' : 's'} in your library` : undefined}
                    actions={roadmaps.length > 3 && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="input h-9 w-48 pl-9" />
                        </div>
                    )}
                />

                {loadingHistory && roadmaps.length === 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-40" />)}</div>
                ) : roadmaps.length === 0 ? (
                    <EmptyState icon={<Map />} title="No roadmaps yet" description="Pick a topic above — your first path takes a few seconds." />
                ) : (
                    <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {shown.map((roadmap) => {
                            const rp = progress.roadmaps.find((r) => r.roadmapId === roadmap.id);
                            const doneCount = roadmap.levels.filter((l) => rp?.completedLevels.includes(l.id)).length;
                            const total = roadmap.levels.length || 1;
                            const pct = Math.round((doneCount / total) * 100);
                            return (
                                <motion.div
                                    key={roadmap.id}
                                    variants={stagger.item}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openRoadmap(roadmap)}
                                    onKeyDown={(e) => e.key === 'Enter' && openRoadmap(roadmap)}
                                    className="card card-hover group relative cursor-pointer p-5"
                                >
                                    <button
                                        onClick={(e) => handleDeleteRoadmap(e, roadmap)}
                                        className="absolute right-3 top-3 rounded-lg p-1.5 text-subtle opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                                        title="Delete roadmap"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                    <div className="flex items-center gap-4">
                                        <ProgressRing value={pct} size={54} stroke={5}>
                                            {pct === 100 ? <Crown className="size-5 text-amber-500" /> : <span className="text-xs font-semibold">{pct}%</span>}
                                        </ProgressRing>
                                        <div className="min-w-0 pr-6">
                                            <h4 className="truncate font-semibold group-hover:text-brand-600 dark:group-hover:text-brand-300">{roadmap.topic}</h4>
                                            <p className="text-xs text-subtle">{doneCount}/{roadmap.levels.length} levels · {timeAgo(roadmap.createdAt)}</p>
                                        </div>
                                    </div>
                                    <ProgressBar value={pct} tone={pct === 100 ? 'success' : 'brand'} className="mt-5" />
                                    <div className="mt-4 flex items-center justify-between">
                                        <SourceBadge source={roadmap.source} />
                                        <span className="flex items-center gap-1 text-xs font-medium text-muted transition group-hover:text-ink">
                                            {pct === 0 ? 'Start' : pct === 100 ? 'Review' : 'Continue'} <ArrowRight className="size-3.5" />
                                        </span>
                                    </div>
                                </motion.div>
                            );
                        })}
                        <motion.button
                            variants={stagger.item}
                            onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
                            className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm text-subtle transition hover:border-brand-500/50 hover:text-brand-500"
                        >
                            <Plus className="size-5" /> New roadmap
                        </motion.button>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default RoadmapView;
