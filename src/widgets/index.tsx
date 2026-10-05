import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, ChevronRight, Flame, Lock, Shield, Target, Trophy, Zap } from 'lucide-react';
import { REWARDS, useProgress } from '../services/progressService';
import * as api from '../services/apiService';
import { questsFor, useActivity, useDailyGoal, weekStrip, GOAL_OPTIONS, setDailyGoal } from '../lib/activity';
import { useProfile } from '../lib/session';
import { RewardIcon } from '../lib/icons';
import { cn } from '../lib/cn';
import { Avatar, Card, Modal, ProgressBar } from '../ui';

// ── Streak ──────────────────────────────────────────
export const StreakWidget: React.FC<{ className?: string; flat?: boolean }> = ({ className, flat }) => {
    const { streak } = useProgress();
    const { data } = useActivity();
    const week = weekStrip(data?.days);
    const activeToday = week[6]?.active;
    return (
        <Card className={cn('p-5', flat && 'border-0 p-0', className)}>
            <div className="flex items-center gap-4">
                <motion.div
                    animate={activeToday ? { scale: [1, 1.12, 1] } : {}}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    className={cn('flex size-14 items-center justify-center rounded-2xl', streak > 0 ? 'bg-orange-500/15 text-orange-500' : 'bg-sunken text-subtle')}
                >
                    <Flame className="size-8" fill={streak > 0 ? 'currentColor' : 'none'} />
                </motion.div>
                <div>
                    <div className="font-display text-3xl font-extrabold leading-none">{streak}</div>
                    <div className="mt-1 text-sm font-semibold text-muted">day streak</div>
                </div>
            </div>
            <div className="mt-5 flex justify-between">
                {week.map((d) => (
                    <div key={d.date} className="flex flex-col items-center gap-1.5">
                        <span className={cn('text-[11px] font-bold', d.isToday ? 'text-orange-500' : 'text-subtle')}>{d.label}</span>
                        <span className={cn('flex size-7 items-center justify-center rounded-full border-2',
                            d.active ? 'border-orange-500 bg-orange-500 text-white' : d.isToday ? 'border-orange-300 border-dashed' : 'border-line bg-sunken')}>
                            {d.active && <Check className="size-3.5" strokeWidth={4} />}
                        </span>
                    </div>
                ))}
            </div>
            <p className="mt-4 text-xs text-muted">
                {activeToday ? 'You’ve practiced today — streak secured! 🔥' : 'Complete a lesson, chat with the tutor or run code to keep your streak.'}
            </p>
        </Card>
    );
};

// ── Daily quests ────────────────────────────────────
export const QuestsWidget: React.FC<{ className?: string }> = ({ className }) => {
    const { data } = useActivity();
    const goal = useDailyGoal();
    const [goalOpen, setGoalOpen] = useState(false);
    const quests = questsFor(data?.today, goal);
    return (
        <Card className={cn('p-5', className)}>
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">Daily quests</h3>
                <button onClick={() => setGoalOpen(true)} className="text-xs font-bold uppercase tracking-wider text-brand-600 hover:underline dark:text-brand-300">Set goal</button>
            </div>
            <div className="space-y-4">
                {quests.map((q) => {
                    const done = q.value >= q.goal;
                    return (
                        <Link key={q.id} to={q.to} className="group flex items-center gap-3">
                            <span className="text-2xl">{q.emoji}</span>
                            <div className="min-w-0 flex-1">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-bold group-hover:text-brand-600 dark:group-hover:text-brand-300">{q.label}</span>
                                    {done && <Check className="size-4 text-emerald-500" strokeWidth={3} />}
                                </div>
                                <div className="relative">
                                    <ProgressBar value={(q.value / q.goal) * 100} tone={done ? 'success' : 'amber'} size="lg" />
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-ink/70">{Math.min(q.value, q.goal)} / {q.goal}</span>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
            <Modal open={goalOpen} onClose={() => setGoalOpen(false)} title="Pick a daily goal" description="How much XP do you want to earn each day? Completing a level earns its XP reward.">
                <div className="space-y-2">
                    {GOAL_OPTIONS.map((g) => (
                        <button key={g.xp} onClick={() => { setDailyGoal(g.xp); setGoalOpen(false); }}
                            className={cn('flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition',
                                goal === g.xp ? 'border-brand-500 bg-brand-500/10' : 'border-line hover:border-line-strong')}>
                            <div><div className="font-bold">{g.label}</div><div className="text-xs text-muted">{g.hint}</div></div>
                            <span className="font-display font-extrabold text-brand-600 dark:text-brand-300">{g.xp} XP</span>
                        </button>
                    ))}
                </div>
            </Modal>
        </Card>
    );
};

// ── League (leaderboard snippet) ────────────────────
export const LeagueWidget: React.FC<{ className?: string }> = ({ className }) => {
    const profile = useProfile();
    const [board, setBoard] = useState<api.LeaderboardResponse | null>(null);
    useEffect(() => { api.getLeaderboard(5).then(setBoard).catch(() => setBoard({ leaders: [], me: null, total: 0 })); }, []);
    return (
        <Card className={cn('p-5', className)}>
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold">Leaderboard</h3>
                <Link to="/community/leaderboard" className="flex items-center text-xs font-bold uppercase tracking-wider text-brand-600 hover:underline dark:text-brand-300">View <ChevronRight className="size-3.5" /></Link>
            </div>
            {!board ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</div>
            ) : board.leaders.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl bg-sunken p-3 text-sm text-muted"><Shield className="size-8 text-subtle" />Finish a lesson to enter the rankings.</div>
            ) : (
                <div className="space-y-1">
                    {board.leaders.map((u) => (
                        <div key={u.id} className={cn('flex items-center gap-3 rounded-xl px-2 py-1.5', u.isMe && 'bg-brand-500/10')}>
                            <span className={cn('w-5 text-center font-display font-extrabold', u.rank === 1 ? 'text-amber-500' : u.rank === 2 ? 'text-slate-400' : u.rank === 3 ? 'text-orange-600' : 'text-subtle')}>{u.rank}</span>
                            <Avatar src={u.picture} name={u.name} size={30} />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{u.isMe ? 'You' : u.name}</span>
                            <span className="text-xs font-bold text-muted">{u.xp.toLocaleString()} XP</span>
                        </div>
                    ))}
                    {board.me && !board.leaders.some((l) => l.isMe) && (
                        <div className="mt-1 flex items-center gap-3 rounded-xl border-t-2 border-dashed border-line bg-brand-500/10 px-2 py-1.5">
                            <span className="w-5 text-center font-display font-extrabold text-brand-600">{board.me.rank}</span>
                            <Avatar src={profile?.picture} name={profile?.name} size={30} />
                            <span className="flex-1 text-sm font-semibold">You</span>
                            <span className="text-xs font-bold">{board.me.xp.toLocaleString()} XP</span>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
};

// ── Level / XP ──────────────────────────────────────
export const LevelWidget: React.FC<{ className?: string }> = ({ className }) => {
    const { xp, level, rank, levelProgress, xpToNext } = useProgress();
    return (
        <Card className={cn('p-5', className)}>
            <div className="flex items-center gap-4">
                <div className="relative flex size-14 items-center justify-center rounded-2xl bg-brand-500 font-display text-2xl font-extrabold text-white shadow-[0_4px_0_0_var(--color-brand-700)]">
                    {level}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{rank}</span>
                        <span className="flex items-center gap-1 text-sm font-bold text-amber-500"><Zap className="size-4" fill="currentColor" />{xp.toLocaleString()}</span>
                    </div>
                    <ProgressBar value={levelProgress} className="mt-2" />
                    <div className="mt-1 text-xs text-muted">{xpToNext} XP to level {level + 1}</div>
                </div>
            </div>
        </Card>
    );
};

// ── Badges ──────────────────────────────────────────
export const BadgesWidget: React.FC<{ className?: string; large?: boolean }> = ({ className, large }) => {
    const { earned } = useProgress();
    return (
        <div className={cn('grid gap-3', large ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4', className)}>
            {REWARDS.map((r) => {
                const has = earned.some((e) => e.id === r.id);
                return (
                    <div key={r.id} title={`${r.name} — ${r.description}`} className={cn('flex flex-col items-center text-center', large && 'panel p-4')}>
                        <div className={cn('flex items-center justify-center rounded-2xl', large ? 'size-16' : 'size-12',
                            has ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-white shadow-[0_4px_0_0_#b45309]' : 'bg-sunken text-subtle')}>
                            {has ? <RewardIcon name={r.icon} className={large ? 'size-7' : 'size-5'} /> : <Lock className="size-4" />}
                        </div>
                        {large && <><div className="mt-3 text-sm font-bold">{r.name}</div><div className="text-xs text-muted">{r.description}</div></>}
                    </div>
                );
            })}
        </div>
    );
};

export const RightRail: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <aside className="hidden w-[340px] shrink-0 space-y-5 xl:block">
        {children}
        <StreakWidget />
        <QuestsWidget />
        <LeagueWidget />
        <div className="px-2 text-xs text-subtle">
            <Link to="/profile" className="font-bold hover:text-muted">Profile</Link> · <Link to="/community/leaderboard" className="font-bold hover:text-muted">Leaderboard</Link> · <Link to="/courses" className="font-bold hover:text-muted">Courses</Link>
        </div>
    </aside>
);

export { Target, Trophy };
