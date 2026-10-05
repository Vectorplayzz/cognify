import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Flame, LogOut, Moon, Sun, Target, Trophy, Zap } from 'lucide-react';
import * as api from '../services/apiService';
import { useProgress } from '../services/progressService';
import { useRoadmaps } from '../services/roadmapStore';
import { useActivity, useDailyGoal, setDailyGoal, GOAL_OPTIONS } from '../lib/activity';
import { useProfile } from '../lib/session';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/cn';
import { Avatar, Card, ProgressBar, SectionTitle } from '../ui';
import { BadgesWidget } from '../widgets';
import { useSignOut } from '../shell/nav';

const WEEKS = 26;

const Heatmap: React.FC<{ days: api.DayActivity[] }> = ({ days }) => {
    const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (WEEKS * 7 - 1) - today.getDay());
    const cells: { key: string; date: Date; score: number; d?: api.DayActivity }[] = [];
    for (let i = 0; i < (WEEKS + 1) * 7; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (d > today) break;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const a = byDate.get(key);
        const score = a ? a.levels * 3 + a.chats + a.runs + a.notes * 2 : 0;
        cells.push({ key, date: d, score, d: a });
    }
    const level = (s: number) => (s === 0 ? 0 : s < 3 ? 1 : s < 7 ? 2 : s < 12 ? 3 : 4);
    const colors = ['bg-sunken', 'bg-brand-200 dark:bg-brand-900', 'bg-brand-300 dark:bg-brand-700', 'bg-brand-500', 'bg-brand-700 dark:bg-brand-300'];
    const cols: typeof cells[] = [];
    cells.forEach((c, i) => { (cols[Math.floor(i / 7)] ||= []).push(c); });
    const activeDays = cells.filter((c) => c.score > 0).length;
    return (
        <div>
            <div className="overflow-x-auto pb-2">
                <div className="flex w-max gap-[3px]">
                    {cols.map((col, ci) => (
                        <div key={ci} className="flex flex-col gap-[3px]">
                            {col.map((c) => (
                                <div key={c.key} className={cn('size-[13px] rounded-[3px]', colors[level(c.score)])}
                                    title={`${c.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${c.d ? `${c.d.levels} levels, ${c.d.chats} tutor messages, ${c.d.runs} code runs, ${c.d.notes} notes` : 'no activity'}`} />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-subtle">
                <span>{activeDays} active days in the last {WEEKS} weeks</span>
                <span className="flex items-center gap-1">Less {colors.map((c, i) => <span key={i} className={cn('size-3 rounded-[3px]', c)} />)} More</span>
            </div>
        </div>
    );
};

const Profile: React.FC = () => {
    const profile = useProfile();
    const { xp, level, rank, streak, levelProgress, xpToNext, progress } = useProgress();
    const { roadmaps } = useRoadmaps();
    const { data } = useActivity();
    const goal = useDailyGoal();
    const { theme, toggle } = useTheme();
    const signOut = useSignOut();
    const [joined, setJoined] = useState<string | null>(null);
    const [board, setBoard] = useState<api.LeaderboardResponse | null>(null);
    useEffect(() => {
        api.getCurrentUser().then((u) => setJoined(u.created_at)).catch(() => {});
        api.getLeaderboard(1).then(setBoard).catch(() => {});
    }, []);

    const quizzes = progress.roadmaps.flatMap((r) => r.quizResults);
    const avg = quizzes.length ? Math.round(quizzes.reduce((a, q) => a + (q.total ? q.score / q.total : 0), 0) / quizzes.length * 100) : 0;
    const levelsDone = progress.roadmaps.reduce((a, r) => a + r.completedLevels.length, 0);
    const best = useMemo(() => {
        const set = new Set((data?.days || []).filter((d) => d.levels + d.chats + d.runs + d.notes > 0).map((d) => d.date));
        let bestRun = 0, run = 0;
        const sorted = Array.from(set).sort();
        let prev: Date | null = null;
        for (const s of sorted) {
            const d = new Date(s + 'T00:00:00');
            run = prev && (d.getTime() - prev.getTime()) / 864e5 === 1 ? run + 1 : 1;
            bestRun = Math.max(bestRun, run);
            prev = d;
        }
        return Math.max(bestRun, streak);
    }, [data, streak]);

    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
            {/* header */}
            <div className="flex flex-col items-center gap-6 border-b-2 border-line pb-8 sm:flex-row sm:items-end">
                <div className="relative">
                    <Avatar src={profile?.picture} name={profile?.name} size={120} className="ring-4 ring-surface" />
                    <span className="absolute -bottom-2 -right-2 flex size-11 items-center justify-center rounded-2xl bg-brand-500 font-display text-lg font-extrabold text-white shadow-[0_3px_0_0_var(--color-brand-700)]">{level}</span>
                </div>
                <div className="flex-1 text-center sm:text-left">
                    <h1 className="text-3xl font-extrabold">{profile?.name || 'Learner'}</h1>
                    <p className="text-muted">{profile?.email}</p>
                    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm font-semibold text-subtle sm:justify-start">
                        {joined && <span className="flex items-center gap-1.5"><CalendarDays className="size-4" /> Joined {new Date(joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}
                        <span className="flex items-center gap-1.5"><Trophy className="size-4" /> {rank}</span>
                        {board?.me && <span className="flex items-center gap-1.5">#{board.me.rank} of {board.total}</span>}
                    </div>
                </div>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
                <div className="space-y-8">
                    <section>
                        <SectionTitle>Statistics</SectionTitle>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {[
                                { icon: Flame, label: 'Day streak', value: streak, tone: 'text-orange-500' },
                                { icon: Flame, label: 'Best streak', value: best, tone: 'text-orange-400' },
                                { icon: Zap, label: 'Total XP', value: xp.toLocaleString(), tone: 'text-amber-500' },
                                { icon: Target, label: 'Levels done', value: levelsDone, tone: 'text-emerald-500' },
                                { icon: Trophy, label: 'Quizzes taken', value: quizzes.length, tone: 'text-sky-500' },
                                { icon: Target, label: 'Avg quiz score', value: `${avg}%`, tone: 'text-pink-500' },
                            ].map((s) => (
                                <Card key={s.label} className="flex items-center gap-3 p-4">
                                    <s.icon className={cn('size-7 shrink-0', s.tone)} fill={s.icon === Flame || s.icon === Zap ? 'currentColor' : 'none'} />
                                    <div><div className="font-display text-xl font-extrabold leading-none">{s.value}</div><div className="mt-1 text-xs font-semibold text-subtle">{s.label}</div></div>
                                </Card>
                            ))}
                        </div>
                    </section>
                    <section>
                        <SectionTitle>Activity</SectionTitle>
                        <Card className="p-5">{data ? <Heatmap days={data.days} /> : <div className="skeleton h-28" />}</Card>
                    </section>
                    <section>
                        <SectionTitle>Badges</SectionTitle>
                        <BadgesWidget large />
                    </section>
                    <section>
                        <SectionTitle action={<Link to="/courses" className="text-sm font-bold text-brand-600 hover:underline dark:text-brand-300">All courses</Link>}>Courses</SectionTitle>
                        <div className="space-y-3">
                            {roadmaps.length === 0 ? <Card className="p-6 text-center text-sm text-muted">No courses yet.</Card> : roadmaps.map((r) => {
                                const rp = progress.roadmaps.find((p) => p.roadmapId === r.id);
                                const d = r.levels.filter((l) => rp?.completedLevels.includes(l.id)).length;
                                return (
                                    <Card key={r.id} className="flex items-center gap-4 p-4">
                                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 font-display text-lg font-extrabold text-brand-600 dark:text-brand-300">{r.topic[0]?.toUpperCase()}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex justify-between gap-2"><span className="truncate font-bold">{r.topic}</span><span className="text-xs font-bold text-subtle">{d}/{r.levels.length}</span></div>
                                            <ProgressBar value={(d / (r.levels.length || 1)) * 100} tone={d === r.levels.length ? 'success' : 'brand'} size="sm" className="mt-2" />
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </section>
                </div>

                <aside className="space-y-5">
                    <Card className="p-5">
                        <div className="mb-3 font-bold">Level {level}</div>
                        <ProgressBar value={levelProgress} />
                        <div className="mt-2 text-xs text-muted">{xpToNext} XP to level {level + 1}</div>
                    </Card>
                    <Card className="p-5">
                        <div className="mb-3 font-bold">Daily goal</div>
                        <div className="space-y-2">
                            {GOAL_OPTIONS.map((g) => (
                                <button key={g.xp} onClick={() => setDailyGoal(g.xp)} className={cn('flex w-full items-center justify-between rounded-xl border-2 px-3 py-2 text-sm', goal === g.xp ? 'border-brand-500 bg-brand-500/10 font-bold' : 'border-line font-semibold text-muted hover:border-line-strong')}>
                                    {g.label}<span>{g.xp} XP</span>
                                </button>
                            ))}
                        </div>
                    </Card>
                    <Card className="p-2">
                        <button onClick={toggle} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-muted hover:bg-sunken">{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />} {theme === 'dark' ? 'Light' : 'Dark'} mode</button>
                        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-red-500 hover:bg-red-500/10"><LogOut className="size-4" /> Sign out</button>
                    </Card>
                </aside>
            </div>
        </div>
    );
};

export default Profile;
