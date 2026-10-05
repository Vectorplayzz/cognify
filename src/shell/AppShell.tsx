import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Flame, LogOut, Menu, Moon, Search, Sun, Target, Trophy, User, Zap } from 'lucide-react';
import { useProgress } from '../services/progressService';
import { useProfile } from '../lib/session';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/cn';
import { Avatar, Drawer, Kbd } from '../ui';
import { StreakWidget, LevelWidget, QuestsWidget } from '../widgets';
import Logo from './Logo';
import CommandPalette from './CommandPalette';
import { NAV, useSignOut } from './nav';

/** Small popover anchored under a top-bar pill. */
const Popover: React.FC<{ open: boolean; onClose: () => void; children: React.ReactNode; className?: string }> = ({ open, onClose, children, className }) => (
    <AnimatePresence>
        {open && (
            <>
                <div className="fixed inset-0 z-40" onClick={onClose} />
                <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className={cn('absolute right-0 top-[calc(100%+10px)] z-50 w-80', className)}
                >
                    {children}
                </motion.div>
            </>
        )}
    </AnimatePresence>
);

const FULL_BLEED = ['/practice', '/tutor', '/notes', '/community'];

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const profile = useProfile();
    const { xp, streak, level } = useProgress();
    const { theme, toggle } = useTheme();
    const signOut = useSignOut();
    const [open, setOpen] = useState<'streak' | 'xp' | 'me' | null>(null);
    const [palette, setPalette] = useState(false);
    const [more, setMore] = useState(false);
    const fullBleed = FULL_BLEED.some((p) => location.pathname.startsWith(p));

    useEffect(() => { setOpen(null); setMore(false); }, [location.pathname]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const toggleOpen = (k: typeof open) => setOpen((o) => (o === k ? null : k));

    return (
        <div className="flex min-h-dvh flex-col bg-bg">
            {/* ── Top bar ── */}
            <header className="sticky top-0 z-30 border-b-2 border-line bg-surface/95 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-3 sm:px-5">
                    <Logo className="mr-2 shrink-0" compact={false} />

                    <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
                        {NAV.map(({ to, label, icon: Icon }) => (
                            <NavLink key={to} to={to} className={({ isActive }) => cn(
                                'relative flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition-colors',
                                isActive ? 'text-brand-600 dark:text-brand-300' : 'text-muted hover:bg-sunken hover:text-ink',
                            )}>
                                {({ isActive }) => (
                                    <>
                                        {isActive && <motion.span layoutId="topnav" className="absolute inset-0 rounded-xl border-2 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-500/10" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
                                        <Icon className="relative size-[18px]" strokeWidth={2.4} />
                                        <span className="relative">{label}</span>
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </nav>

                    <div className="ml-auto flex items-center gap-1">
                        <button onClick={() => setPalette(true)} className="hidden h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-subtle transition hover:bg-sunken hover:text-muted md:flex">
                            <Search className="size-4" /> <span className="hidden xl:inline">Search</span> <span className="hidden gap-0.5 xl:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
                        </button>
                        <button onClick={() => setPalette(true)} className="flex size-10 items-center justify-center rounded-xl text-subtle hover:bg-sunken md:hidden" aria-label="Search"><Search className="size-5" /></button>

                        <div className="relative">
                            <button onClick={() => toggleOpen('streak')} className={cn('flex h-10 items-center gap-1.5 rounded-xl px-2.5 font-display text-[15px] font-extrabold transition hover:bg-sunken', streak > 0 ? 'text-orange-500' : 'text-subtle')}>
                                <Flame className="size-5" fill={streak > 0 ? 'currentColor' : 'none'} /> {streak}
                            </button>
                            <Popover open={open === 'streak'} onClose={() => setOpen(null)}><StreakWidget /></Popover>
                        </div>
                        <div className="relative">
                            <button onClick={() => toggleOpen('xp')} className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 font-display text-[15px] font-extrabold text-amber-500 transition hover:bg-sunken">
                                <Zap className="size-5" fill="currentColor" /> {xp.toLocaleString()}
                            </button>
                            <Popover open={open === 'xp'} onClose={() => setOpen(null)} className="w-96 space-y-3">
                                <LevelWidget />
                                <QuestsWidget />
                            </Popover>
                        </div>

                        <div className="relative ml-1">
                            <button onClick={() => toggleOpen('me')} className="flex items-center rounded-full ring-brand-300 transition hover:ring-4" aria-label="Account">
                                <Avatar src={profile?.picture} name={profile?.name} size={36} />
                            </button>
                            <Popover open={open === 'me'} onClose={() => setOpen(null)} className="w-72">
                                <div className="panel p-2">
                                    <div className="flex items-center gap-3 p-2">
                                        <Avatar src={profile?.picture} name={profile?.name} size={44} />
                                        <div className="min-w-0">
                                            <div className="truncate font-bold">{profile?.name || 'Learner'}</div>
                                            <div className="truncate text-xs text-subtle">Level {level} · {profile?.email}</div>
                                        </div>
                                    </div>
                                    <div className="my-1 h-0.5 bg-line" />
                                    {[
                                        { to: '/profile', icon: User, label: 'Your profile' },
                                        { to: '/community/leaderboard', icon: Trophy, label: 'Leaderboard' },
                                        { to: '/learn', icon: Target, label: 'Daily goal & quests' },
                                    ].map((i) => (
                                        <Link key={i.to + i.label} to={i.to} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-sunken hover:text-ink">
                                            <i.icon className="size-4" /> {i.label}
                                        </Link>
                                    ))}
                                    <button onClick={toggle} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-sunken hover:text-ink">
                                        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />} {theme === 'dark' ? 'Light' : 'Dark'} mode
                                    </button>
                                    <div className="my-1 h-0.5 bg-line" />
                                    <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/10">
                                        <LogOut className="size-4" /> Sign out
                                    </button>
                                </div>
                            </Popover>
                        </div>
                    </div>
                </div>
            </header>

            <main className={cn('relative', fullBleed ? 'h-[calc(100dvh-66px)] flex-none overflow-hidden max-lg:h-[calc(100dvh-66px-66px)]' : 'flex-1 pb-24 lg:pb-12')}>
                {children}
            </main>

            {/* ── Mobile tab bar ── */}
            <nav className="sticky bottom-0 z-30 flex border-t-2 border-line bg-surface px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 lg:hidden">
                {NAV.slice(0, 4).map(({ to, label, icon: Icon }) => (
                    <NavLink key={to} to={to} className={({ isActive }) => cn('flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold', isActive ? 'text-brand-600 dark:text-brand-300' : 'text-subtle')}>
                        {({ isActive }) => (
                            <>
                                <span className={cn('flex h-8 w-12 items-center justify-center rounded-xl transition', isActive && 'bg-brand-500/12')}><Icon className="size-5" strokeWidth={2.4} /></span>
                                {label}
                            </>
                        )}
                    </NavLink>
                ))}
                <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-bold text-subtle">
                    <span className="flex h-8 w-12 items-center justify-center"><Menu className="size-5" /></span> More
                </button>
            </nav>
            <Drawer open={more} onClose={() => setMore(false)} side="right">
                <div className="p-4">
                    <div className="mb-4 flex items-center gap-3">
                        <Avatar src={profile?.picture} name={profile?.name} size={44} />
                        <div><div className="font-bold">{profile?.name}</div><div className="text-xs text-subtle">Level {level}</div></div>
                    </div>
                    {[...NAV.slice(4), { to: '/community/leaderboard', label: 'Leaderboard', icon: Trophy }, { to: '/profile', label: 'Profile', icon: User }].map(({ to, label, icon: Icon }) => (
                        <Link key={to} to={to} className="flex items-center gap-3 rounded-xl px-3 py-3 font-bold text-muted hover:bg-sunken"><Icon className="size-5" />{label}</Link>
                    ))}
                    <button onClick={toggle} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 font-bold text-muted hover:bg-sunken">{theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />} {theme === 'dark' ? 'Light' : 'Dark'} mode</button>
                    <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 font-bold text-red-500 hover:bg-red-500/10"><LogOut className="size-5" /> Sign out</button>
                </div>
            </Drawer>

            <CommandPalette open={palette} onClose={() => setPalette(false)} />
        </div>
    );
};

export default AppShell;
