import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
    ArrowRight, ArrowUpRight, Bot, Code2, Flame, Map, NotebookPen, Sparkles, Target, Trophy, Zap,
} from 'lucide-react';
import { useProgress, REWARDS, XP_PER_LEVEL } from '../services/progressService';
import { useRoadmaps } from '../services/roadmapStore';
import { useProfile } from '../lib/session';
import { firstName, greeting } from '../lib/format';
import { RewardIcon } from '../lib/icons';
import * as api from '../services/apiService';
import { Avatar, Button, Card, EmptyState, ProgressBar, ProgressRing, stagger } from '../components/ui';
import { cn } from '../lib/cn';

const QUICK = [
    { to: '/roadmap', icon: Map, title: 'New roadmap', body: 'Turn any topic into a path', gradient: 'from-brand-500 to-indigo-500' },
    { to: '/chatbot', icon: Bot, title: 'Ask the tutor', body: 'Explanations on demand', gradient: 'from-cyan-500 to-sky-600' },
    { to: '/playground', icon: Code2, title: 'Open playground', body: 'Run code in 8 languages', gradient: 'from-emerald-500 to-teal-600' },
    { to: '/notes', icon: NotebookPen, title: 'Make notes', body: 'From PDFs and text', gradient: 'from-pink-500 to-rose-600' },
];

const HomeView: React.FC = () => {
    const navigate = useNavigate();
    const profile = useProfile();
    const { xp, level, rank, streak, levelProgress, xpToNext, progress, earned } = useProgress();
    const { roadmaps, loading, loaded } = useRoadmaps();
    const [topic, setTopic] = useState('');
    const [board, setBoard] = useState<api.LeaderboardResponse | null>(null);

    useEffect(() => {
        api.getLeaderboard(5).then(setBoard).catch(() => setBoard(null));
    }, []);

    const allQuizzes = progress.roadmaps.flatMap((r) => r.quizResults);
    const avgScore = allQuizzes.length
        ? Math.round(allQuizzes.reduce((a, q) => a + (q.total ? q.score / q.total : 0), 0) / allQuizzes.length * 100)
        : 0;
    const levelsDone = progress.roadmaps.reduce((a, r) => a + r.completedLevels.length, 0);

    const withProgress = roadmaps.map((r) => {
        const rp = progress.roadmaps.find((p) => p.roadmapId === r.id);
        const done = rp?.completedLevels.length || 0;
        const total = r.levels.length || 1;
        const next = r.levels.find((l) => !rp?.completedLevels.includes(l.id));
        return { r, done, total, pct: Math.round((done / total) * 100), next };
    });
    const inProgress = withProgress.filter((x) => x.pct < 100).slice(0, 3);
    const nextReward = REWARDS.filter((r) => r.xpThreshold > xp).sort((a, b) => a.xpThreshold - b.xpThreshold)[0];

    const startTopic = (e: React.FormEvent) => {
        e.preventDefault();
        if (topic.trim()) navigate(`/roadmap?learn=${encodeURIComponent(topic.trim())}`);
    };

    return (
        <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-6">
            {/* ── Greeting + hero card ── */}
            <motion.div variants={stagger.item} className="card ring-gradient relative overflow-hidden p-6 sm:p-8">
                <div className="aurora absolute inset-0 opacity-80" />
                <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-xl">
                        <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                            {greeting()}, <span className="font-serif font-normal italic text-gradient">{firstName(profile?.name)}</span>
                        </h1>
                        <p className="mt-2 text-muted">
                            {streak > 1
                                ? `You're on a ${streak}-day streak — one lesson today keeps it alive.`
                                : 'What do you want to get better at today?'}
                        </p>
                        <form onSubmit={startTopic} className="mt-6 flex gap-2">
                            <div className="relative flex-1">
                                <Sparkles className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-brand-400" />
                                <input
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="Learn something new… e.g. Graph algorithms"
                                    className="input h-12 pl-10"
                                />
                            </div>
                            <Button variant="primary" size="lg" type="submit" disabled={!topic.trim()}>
                                <span className="hidden sm:inline">Build path</span> <ArrowRight className="size-4" />
                            </Button>
                        </form>
                    </div>

                    <div className="flex items-center gap-6">
                        <ProgressRing value={levelProgress} size={132} stroke={11}>
                            <div className="text-[11px] font-medium text-subtle">Level</div>
                            <div className="text-4xl font-semibold tracking-tight">{level}</div>
                        </ProgressRing>
                        <div className="space-y-3">
                            <div>
                                <div className="text-sm font-semibold">{rank}</div>
                                <div className="text-xs text-subtle">{xpToNext} XP to level {level + 1}</div>
                            </div>
                            <div className="flex gap-2">
                                <div className="rounded-xl border border-line bg-surface/70 px-3 py-2">
                                    <div className="flex items-center gap-1 text-lg font-semibold"><Zap className="size-4 text-amber-500" fill="currentColor" />{xp.toLocaleString()}</div>
                                    <div className="text-[11px] text-subtle">Total XP</div>
                                </div>
                                <div className="rounded-xl border border-line bg-surface/70 px-3 py-2">
                                    <div className="flex items-center gap-1 text-lg font-semibold"><Flame className="size-4 text-orange-500" />{streak}</div>
                                    <div className="text-[11px] text-subtle">Day streak</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* ── Stats ── */}
            <motion.div variants={stagger.item} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    { label: 'Roadmaps', value: roadmaps.length, icon: Map, tone: 'text-brand-500 bg-brand-500/10' },
                    { label: 'Levels completed', value: levelsDone, icon: Target, tone: 'text-emerald-500 bg-emerald-500/10' },
                    { label: 'Quizzes taken', value: allQuizzes.length, icon: Sparkles, tone: 'text-cyan-500 bg-cyan-500/10' },
                    { label: 'Avg quiz score', value: `${avgScore}%`, icon: Trophy, tone: 'text-amber-500 bg-amber-500/10' },
                ].map((s) => (
                    <Card key={s.label} className="p-4 sm:p-5">
                        <div className={cn('mb-3 flex size-9 items-center justify-center rounded-lg', s.tone)}><s.icon className="size-[18px]" /></div>
                        <div className="text-2xl font-semibold tracking-tight">{s.value}</div>
                        <div className="text-xs text-subtle">{s.label}</div>
                    </Card>
                ))}
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* ── Continue learning ── */}
                <motion.div variants={stagger.item} className="space-y-3 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold tracking-tight">Continue learning</h2>
                        <Link to="/roadmap" className="flex items-center gap-1 text-sm text-muted hover:text-ink">All roadmaps <ArrowRight className="size-3.5" /></Link>
                    </div>
                    {!loaded && loading && roadmaps.length === 0 ? (
                        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="skeleton h-28" />)}</div>
                    ) : inProgress.length === 0 ? (
                        <EmptyState
                            icon={<Map />}
                            title={roadmaps.length ? 'Every roadmap is complete 🎉' : 'No roadmaps yet'}
                            description={roadmaps.length ? 'Pick a new topic to keep the streak going.' : 'Start with any topic — Cognify builds the path and the lessons.'}
                            action={<Link to="/roadmap"><Button variant="primary" icon={<Sparkles className="size-4" />}>Create a roadmap</Button></Link>}
                        />
                    ) : (
                        inProgress.map(({ r, done, total, pct, next }) => (
                            <Link key={r.id} to={`/roadmap?open=${r.id}`} className="card card-hover group flex items-center gap-4 p-4 sm:p-5">
                                <ProgressRing value={pct} size={56} stroke={6}>
                                    <span className="text-xs font-semibold">{pct}%</span>
                                </ProgressRing>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="truncate font-semibold">{r.topic}</h3>
                                        <span className="shrink-0 text-xs text-subtle">{done}/{total}</span>
                                    </div>
                                    {next && <p className="mt-0.5 truncate text-sm text-muted">Next: {next.title}</p>}
                                    <ProgressBar value={pct} className="mt-3" />
                                </div>
                                <ArrowUpRight className="size-5 shrink-0 text-subtle transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-500" />
                            </Link>
                        ))
                    )}

                    {/* quick actions */}
                    <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-4">
                        {QUICK.map((q) => (
                            <Link key={q.to} to={q.to} className="card card-hover group p-4">
                                <div className={cn('flex size-9 items-center justify-center rounded-lg bg-gradient-to-br text-white', q.gradient)}><q.icon className="size-[18px]" /></div>
                                <div className="mt-3 text-sm font-semibold">{q.title}</div>
                                <div className="text-xs text-subtle">{q.body}</div>
                            </Link>
                        ))}
                    </div>
                </motion.div>

                {/* ── Side column ── */}
                <motion.div variants={stagger.item} className="space-y-6">
                    <Card className="p-5">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold">Leaderboard</h3>
                            <Link to="/leaderboard" className="text-xs text-muted hover:text-ink">View all</Link>
                        </div>
                        <div className="mt-4 space-y-1">
                            {!board ? (
                                [0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)
                            ) : board.leaders.length === 0 ? (
                                <p className="text-sm text-subtle">No rankings yet.</p>
                            ) : (
                                board.leaders.map((u) => (
                                    <div key={u.id} className={cn('flex items-center gap-3 rounded-xl px-2 py-1.5', u.isMe && 'bg-brand-500/10')}>
                                        <span className={cn('w-5 text-center text-sm font-semibold', u.rank <= 3 ? 'text-amber-500' : 'text-subtle')}>{u.rank}</span>
                                        <Avatar src={u.picture} name={u.name} size={28} />
                                        <span className="min-w-0 flex-1 truncate text-sm">{u.isMe ? 'You' : u.name}</span>
                                        <span className="text-xs font-semibold text-muted">{u.xp.toLocaleString()}</span>
                                    </div>
                                ))
                            )}
                            {board?.me && !board.leaders.some((l) => l.isMe) && (
                                <div className="mt-2 flex items-center gap-3 rounded-xl border-t border-line bg-brand-500/10 px-2 py-1.5 pt-2">
                                    <span className="w-5 text-center text-sm font-semibold text-brand-500">{board.me.rank}</span>
                                    <Avatar src={profile?.picture} name={profile?.name} size={28} />
                                    <span className="flex-1 text-sm">You</span>
                                    <span className="text-xs font-semibold">{board.me.xp.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    </Card>

                    <Card className="p-5">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold">Badges</h3>
                            <span className="text-xs text-subtle">{earned.length}/{REWARDS.length}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-4 gap-2">
                            {REWARDS.map((r) => {
                                const has = earned.some((e) => e.id === r.id);
                                return (
                                    <div
                                        key={r.id}
                                        title={`${r.name} — ${r.description}`}
                                        className={cn(
                                            'flex aspect-square items-center justify-center rounded-xl border transition',
                                            has ? 'border-amber-400/30 bg-gradient-to-br from-amber-300/20 to-orange-500/10 text-amber-500' : 'border-line bg-sunken text-subtle/50',
                                        )}
                                    >
                                        <RewardIcon name={r.icon} className="size-5" />
                                    </div>
                                );
                            })}
                        </div>
                        {nextReward && (
                            <div className="mt-4">
                                <div className="mb-1.5 flex justify-between text-xs">
                                    <span className="text-muted">Next: <b className="text-ink">{nextReward.name}</b></span>
                                    <span className="text-subtle">{xp}/{nextReward.xpThreshold}</span>
                                </div>
                                <ProgressBar value={(xp / nextReward.xpThreshold) * 100} />
                            </div>
                        )}
                        <p className="mt-3 text-[11px] text-subtle">Each completed level is worth its XP reward; every {XP_PER_LEVEL} XP is a new level.</p>
                    </Card>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default HomeView;
