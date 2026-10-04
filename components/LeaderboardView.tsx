import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Crown, Flame, Lock, Map, Medal, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import { REWARDS, useProgress } from '../services/progressService';
import { useRoadmaps } from '../services/roadmapStore';
import * as api from '../services/apiService';
import { useProfile } from '../lib/session';
import { RewardIcon } from '../lib/icons';
import { cn } from '../lib/cn';
import { Avatar, Card, EmptyState, PageHeader, ProgressBar, ProgressRing, Segmented, stagger } from './ui';

const PODIUM_STYLE = [
    { ring: 'ring-amber-400', bar: 'from-amber-300 to-amber-500', h: 'h-36', label: '1st', icon: Crown, tone: 'text-amber-500' },
    { ring: 'ring-slate-300', bar: 'from-slate-200 to-slate-400', h: 'h-28', label: '2nd', icon: Medal, tone: 'text-slate-400' },
    { ring: 'ring-orange-400', bar: 'from-orange-300 to-orange-600', h: 'h-20', label: '3rd', icon: Medal, tone: 'text-orange-500' },
];

const LeaderboardView: React.FC = () => {
    const profile = useProfile();
    const { progress, xp, level, rank, streak, levelProgress, xpToNext, earned } = useProgress();
    const { roadmaps } = useRoadmaps();
    const [tab, setTab] = useState<'ranks' | 'me'>('ranks');
    const [board, setBoard] = useState<api.LeaderboardResponse | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        api.getLeaderboard(50).then(setBoard).catch(() => setError(true));
    }, []);

    const quizzes = progress.roadmaps.flatMap((r) => r.quizResults);
    const avg = quizzes.length ? Math.round(quizzes.reduce((a, q) => a + (q.total ? q.score / q.total : 0), 0) / quizzes.length * 100) : 0;
    const levelsDone = progress.roadmaps.reduce((a, r) => a + r.completedLevels.length, 0);

    const podium = board ? [board.leaders[1], board.leaders[0], board.leaders[2]] : [];

    return (
        <div>
            <PageHeader
                eyebrow="Compete & collect"
                title="Leaderboard"
                description="Earn XP by completing levels. Every 200 XP is a new level."
                actions={<Segmented<'ranks' | 'me'> value={tab} onChange={setTab} options={[{ value: 'ranks', label: 'Rankings', icon: <Trophy /> }, { value: 'me', label: 'My progress', icon: <Sparkles /> }]} />}
            />

            {tab === 'ranks' ? (
                error ? (
                    <EmptyState icon={<Trophy />} title="Rankings are unavailable right now" description="Please try again in a moment." />
                ) : !board ? (
                    <div className="space-y-3"><div className="skeleton h-64" /><div className="skeleton h-14" /><div className="skeleton h-14" /></div>
                ) : board.leaders.length === 0 ? (
                    <EmptyState icon={<Trophy />} title="No one on the board yet" description="Complete a level to claim the top spot." />
                ) : (
                    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                        <div className="space-y-6">
                            {/* podium */}
                            <Card className="relative overflow-hidden px-4 pb-0 pt-8 sm:px-8">
                                <div className="aurora absolute inset-0 opacity-70" />
                                <div className="relative flex items-end justify-center gap-3 sm:gap-6">
                                    {podium.map((u, i) => {
                                        if (!u) return <div key={i} className="w-24 sm:w-32" />;
                                        const s = PODIUM_STYLE[u.rank - 1];
                                        return (
                                            <motion.div
                                                key={u.id}
                                                initial={{ opacity: 0, y: 30 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.15 * (u.rank === 1 ? 0 : u.rank), type: 'spring', bounce: 0.3 }}
                                                className="flex w-24 flex-col items-center sm:w-32"
                                            >
                                                <s.icon className={cn('mb-1 size-5', s.tone)} />
                                                <div className={cn('rounded-full ring-4 ring-offset-2 ring-offset-surface', s.ring)}>
                                                    <Avatar src={u.picture} name={u.name} size={u.rank === 1 ? 72 : 56} />
                                                </div>
                                                <div className="mt-2 max-w-full truncate text-sm font-semibold">{u.isMe ? 'You' : u.name}</div>
                                                <div className="flex items-center gap-1 text-xs text-muted"><Zap className="size-3 text-amber-500" fill="currentColor" />{u.xp.toLocaleString()}</div>
                                                <div className={cn('mt-3 flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-2 font-semibold text-white/90 shadow-inner', s.bar, s.h)}>
                                                    {s.label}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </Card>

                            {/* table */}
                            <Card className="overflow-hidden">
                                <div className="grid grid-cols-[3rem_1fr_5rem_5rem] items-center gap-2 border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle sm:grid-cols-[3rem_1fr_5rem_5rem_6rem]">
                                    <span>#</span><span>Learner</span><span className="text-right">Level</span><span className="hidden text-right sm:block">Streak</span><span className="text-right">XP</span>
                                </div>
                                <motion.div variants={stagger.container} initial="hidden" animate="show">
                                    {board.leaders.map((u) => (
                                        <motion.div
                                            key={u.id}
                                            variants={stagger.item}
                                            className={cn(
                                                'grid grid-cols-[3rem_1fr_5rem_5rem] items-center gap-2 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[3rem_1fr_5rem_5rem_6rem]',
                                                u.isMe && 'bg-brand-500/[0.08]',
                                            )}
                                        >
                                            <span className={cn('font-mono text-sm font-semibold', u.rank <= 3 ? PODIUM_STYLE[u.rank - 1].tone : 'text-subtle')}>{u.rank}</span>
                                            <div className="flex min-w-0 items-center gap-3">
                                                <Avatar src={u.picture} name={u.name} size={32} />
                                                <span className="truncate text-sm font-medium">{u.isMe ? `${u.name} (you)` : u.name}</span>
                                            </div>
                                            <span className="text-right text-sm text-muted">{u.level}</span>
                                            <span className="hidden items-center justify-end gap-1 text-sm text-muted sm:flex">{u.streak > 0 && <Flame className="size-3.5 text-orange-500" />}{u.streak}</span>
                                            <span className="text-right text-sm font-semibold">{u.xp.toLocaleString()}</span>
                                        </motion.div>
                                    ))}
                                </motion.div>
                                {board.me && !board.leaders.some((l) => l.isMe) && (
                                    <div className="grid grid-cols-[3rem_1fr_5rem_5rem] items-center gap-2 border-t-2 border-dashed border-line bg-brand-500/[0.08] px-4 py-3 sm:grid-cols-[3rem_1fr_5rem_5rem_6rem]">
                                        <span className="font-mono text-sm font-semibold text-brand-500">{board.me.rank}</span>
                                        <div className="flex items-center gap-3"><Avatar src={profile?.picture} name={profile?.name} size={32} /><span className="text-sm font-medium">You</span></div>
                                        <span className="text-right text-sm text-muted">{board.me.level}</span>
                                        <span className="hidden text-right text-sm text-muted sm:block">{board.me.streak}</span>
                                        <span className="text-right text-sm font-semibold">{board.me.xp.toLocaleString()}</span>
                                    </div>
                                )}
                            </Card>
                        </div>

                        {/* my standing */}
                        <div className="space-y-4">
                            <Card className="p-6 text-center">
                                <Avatar src={profile?.picture} name={profile?.name} size={64} className="mx-auto" />
                                <div className="mt-3 font-semibold">{profile?.name}</div>
                                <div className="text-sm text-muted">{rank}</div>
                                <div className="mt-5 grid grid-cols-3 gap-2">
                                    <div className="rounded-xl bg-sunken p-2.5"><div className="text-lg font-semibold">#{board.me?.rank ?? '—'}</div><div className="text-[11px] text-subtle">Rank</div></div>
                                    <div className="rounded-xl bg-sunken p-2.5"><div className="text-lg font-semibold">{level}</div><div className="text-[11px] text-subtle">Level</div></div>
                                    <div className="rounded-xl bg-sunken p-2.5"><div className="text-lg font-semibold">{streak}</div><div className="text-[11px] text-subtle">Streak</div></div>
                                </div>
                                <div className="mt-5 text-left">
                                    <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted">Level {level + 1}</span><span className="text-subtle">{xpToNext} XP to go</span></div>
                                    <ProgressBar value={levelProgress} />
                                </div>
                            </Card>
                            <p className="px-2 text-center text-xs text-subtle">{board.total} learner{board.total === 1 ? '' : 's'} ranked by total XP.</p>
                        </div>
                    </div>
                )
            ) : (
                <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-6">
                    <motion.div variants={stagger.item}>
                        <Card className="ring-gradient relative overflow-hidden p-6 sm:p-8">
                            <div className="aurora absolute inset-0 opacity-70" />
                            <div className="relative flex flex-col items-center gap-6 md:flex-row">
                                <ProgressRing value={levelProgress} size={128} stroke={10}>
                                    <Avatar src={profile?.picture} name={profile?.name} size={92} />
                                </ProgressRing>
                                <div className="flex-1 text-center md:text-left">
                                    <h2 className="text-2xl font-semibold tracking-tight">{profile?.name || 'Learner'}</h2>
                                    <p className="text-sm font-medium text-brand-600 dark:text-brand-300">{rank} · Level {level}</p>
                                    <p className="mt-1 text-sm text-muted">{xpToNext} XP until level {level + 1}</p>
                                </div>
                                <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 md:w-auto">
                                    {[
                                        { icon: Zap, v: xp.toLocaleString(), l: 'Total XP', t: 'text-amber-500' },
                                        { icon: Target, v: levelsDone, l: 'Levels', t: 'text-emerald-500' },
                                        { icon: Sparkles, v: quizzes.length, l: 'Quizzes', t: 'text-cyan-500' },
                                        { icon: Trophy, v: `${avg}%`, l: 'Avg score', t: 'text-brand-500' },
                                    ].map((s) => (
                                        <div key={s.l} className="rounded-xl border border-line bg-surface/70 px-4 py-3 text-center">
                                            <s.icon className={cn('mx-auto size-4', s.t)} />
                                            <div className="mt-1 text-lg font-semibold">{s.v}</div>
                                            <div className="text-[11px] text-subtle">{s.l}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    </motion.div>

                    <motion.div variants={stagger.item}>
                        <h3 className="mb-3 text-lg font-semibold tracking-tight">Badges <span className="text-sm font-normal text-subtle">{earned.length}/{REWARDS.length}</span></h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {REWARDS.map((r) => {
                                const has = earned.some((e) => e.id === r.id);
                                return (
                                    <Card key={r.id} className={cn('p-5 text-center transition', has ? 'border-amber-400/30' : 'opacity-60')}>
                                        <div className={cn('mx-auto flex size-14 items-center justify-center rounded-2xl', has ? 'bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-lg shadow-orange-500/25' : 'bg-sunken text-subtle')}>
                                            {has ? <RewardIcon name={r.icon} className="size-6" /> : <Lock className="size-5" />}
                                        </div>
                                        <div className="mt-3 text-sm font-semibold">{r.name}</div>
                                        <div className="mt-0.5 text-xs text-subtle">{r.description}</div>
                                    </Card>
                                );
                            })}
                        </div>
                    </motion.div>

                    <motion.div variants={stagger.item}>
                        <h3 className="mb-3 text-lg font-semibold tracking-tight">Roadmap progress</h3>
                        {roadmaps.length === 0 ? (
                            <EmptyState icon={<Map />} title="No roadmaps yet" description="Start a roadmap to track progress here." />
                        ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                                {roadmaps.map((r) => {
                                    const rp = progress.roadmaps.find((p) => p.roadmapId === r.id);
                                    const done = r.levels.filter((l) => rp?.completedLevels.includes(l.id)).length;
                                    const pct = r.levels.length ? Math.round((done / r.levels.length) * 100) : 0;
                                    const qs = rp?.quizResults || [];
                                    const a = qs.length ? Math.round(qs.reduce((s, q) => s + (q.total ? q.score / q.total : 0), 0) / qs.length * 100) : null;
                                    return (
                                        <Card key={r.id} className="p-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-medium">{r.topic}</span>
                                                <span className="shrink-0 text-xs text-subtle">{done}/{r.levels.length}{a !== null && ` · avg ${a}%`}</span>
                                            </div>
                                            <ProgressBar value={pct} tone={pct === 100 ? 'success' : 'brand'} className="mt-3" />
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
};

export default LeaderboardView;
