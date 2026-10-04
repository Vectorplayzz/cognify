import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
    ChevronsLeft, ChevronsRight, Flame, LogOut, Moon, Search, Sun, Zap,
} from 'lucide-react';
import { useProgress } from '../services/progressService';
import { useProfile } from '../lib/session';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/cn';
import { Avatar, Kbd } from './ui';
import CommandPalette from './CommandPalette';
import { NAV_ITEMS, useSignOut } from './nav';
import Logo from './Logo';

const SIDEBAR_KEY = 'cognify_sidebar_collapsed';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const profile = useProfile();
    const { xp, level, rank, streak, levelProgress, xpToNext } = useProgress();
    const { theme, toggle } = useTheme();
    const signOut = useSignOut();
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
    });
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ }
    }, [collapsed]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen((o) => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => setMenuOpen(false), [location.pathname]);

    const current = NAV_ITEMS.find((n) => location.pathname.startsWith(n.to));
    // Full-bleed views manage their own scrolling and padding.
    const fullBleed = ['/playground', '/chatbot', '/notes'].some((p) => location.pathname.startsWith(p));

    return (
        <div className="relative flex h-dvh overflow-hidden bg-bg">
            {/* atmosphere */}
            <div className="aurora pointer-events-none absolute inset-0 opacity-70" />

            {/* ── Desktop sidebar ── */}
            <motion.aside
                animate={{ width: collapsed ? 76 : 256 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                className="relative z-20 hidden shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-xl md:flex"
            >
                <div className={cn('flex h-16 items-center gap-3 px-4', collapsed && 'justify-center px-0')}>
                    <Logo compact={collapsed} />
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
                    {!collapsed && <div className="eyebrow px-3 pb-2">Learn</div>}
                    {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            title={collapsed ? label : undefined}
                            className={({ isActive }) => cn(
                                'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                                collapsed && 'justify-center px-0',
                                isActive ? 'text-ink' : 'text-muted hover:bg-sunken hover:text-ink',
                            )}
                        >
                            {({ isActive }) => (
                                <>
                                    {isActive && (
                                        <motion.span
                                            layoutId="nav-active"
                                            className="absolute inset-0 rounded-xl border border-brand-500/25 bg-brand-500/10"
                                            transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                                        />
                                    )}
                                    <Icon className={cn('relative size-[18px] shrink-0', isActive ? 'text-brand-500 dark:text-brand-300' : 'text-subtle group-hover:text-muted')} />
                                    {!collapsed && <span className="relative">{label}</span>}
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* level card */}
                <div className="p-3">
                    {collapsed ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500" title={`${streak}-day streak`}>
                                <Flame className="size-[18px]" />
                            </div>
                            <button onClick={() => setCollapsed(false)} className="flex size-10 items-center justify-center rounded-xl text-subtle hover:bg-sunken hover:text-ink" title="Expand sidebar">
                                <ChevronsRight className="size-[18px]" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="ring-gradient overflow-hidden rounded-2xl bg-elevated/80 p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-[11px] font-medium text-subtle">Level {level}</div>
                                        <div className="text-sm font-semibold">{rank}</div>
                                    </div>
                                    <div className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-1 text-xs font-semibold text-orange-500">
                                        <Flame className="size-3.5" /> {streak}
                                    </div>
                                </div>
                                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
                                    <motion.div
                                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${levelProgress}%` }}
                                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                                    />
                                </div>
                                <div className="mt-1.5 flex justify-between text-[11px] text-subtle">
                                    <span>{xp.toLocaleString()} XP</span>
                                    <span>{xpToNext} to L{level + 1}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setCollapsed(true)}
                                className="mt-2 flex h-9 w-full items-center gap-2 rounded-xl px-3 text-xs text-subtle transition hover:bg-sunken hover:text-ink"
                            >
                                <ChevronsLeft className="size-4" /> Collapse
                            </button>
                        </>
                    )}
                </div>
            </motion.aside>

            {/* ── Main column ── */}
            <div className="relative z-10 flex min-w-0 flex-1 flex-col">
                <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-bg/60 px-4 backdrop-blur-xl sm:px-6">
                    <div className="md:hidden"><Logo compact /></div>
                    <div className="hidden min-w-0 items-center gap-2 md:flex">
                        {current && <current.icon className="size-[18px] text-subtle" />}
                        <h2 className="truncate text-sm font-semibold">{current?.label || 'Cognify'}</h2>
                    </div>

                    <button
                        onClick={() => setPaletteOpen(true)}
                        className="ml-auto flex h-9 items-center gap-2 rounded-xl border border-line bg-sunken/60 px-3 text-sm text-subtle transition hover:border-line-strong hover:text-muted md:ml-6 md:w-72"
                    >
                        <Search className="size-4" />
                        <span className="hidden flex-1 text-left md:inline">Jump to…</span>
                        <span className="hidden items-center gap-0.5 md:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
                    </button>

                    <div className="flex items-center gap-1.5 md:ml-auto">
                        <div className="hidden items-center gap-1.5 rounded-full border border-line bg-elevated/70 py-1 pl-1.5 pr-3 text-xs font-semibold sm:flex">
                            <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-white">
                                <Zap className="size-3.5" fill="currentColor" />
                            </span>
                            {xp.toLocaleString()} XP
                        </div>
                        <div className="hidden items-center gap-1 rounded-full border border-line bg-elevated/70 px-3 py-1.5 text-xs font-semibold text-orange-500 sm:flex">
                            <Flame className="size-3.5" /> {streak}d
                        </div>
                        <button
                            onClick={toggle}
                            className="flex size-9 items-center justify-center rounded-xl text-subtle transition hover:bg-sunken hover:text-ink"
                            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.span
                                    key={theme}
                                    initial={{ rotate: -90, opacity: 0 }}
                                    animate={{ rotate: 0, opacity: 1 }}
                                    exit={{ rotate: 90, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                                </motion.span>
                            </AnimatePresence>
                        </button>

                        <div className="relative">
                            <button onClick={() => setMenuOpen((o) => !o)} className="ml-1 flex items-center rounded-full ring-offset-2 ring-offset-bg transition hover:ring-2 hover:ring-brand-500/40">
                                <Avatar src={profile?.picture} name={profile?.name} size={34} />
                            </button>
                            <AnimatePresence>
                                {menuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                            transition={{ duration: 0.15 }}
                                            className="card absolute right-0 top-12 z-50 w-64 bg-elevated p-2"
                                        >
                                            <div className="flex items-center gap-3 px-2 py-2">
                                                <Avatar src={profile?.picture} name={profile?.name} size={40} />
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold">{profile?.name || 'Learner'}</div>
                                                    <div className="truncate text-xs text-subtle">{profile?.email}</div>
                                                </div>
                                            </div>
                                            <div className="my-1 grid grid-cols-3 gap-1 px-1">
                                                {[
                                                    ['Level', level],
                                                    ['XP', xp.toLocaleString()],
                                                    ['Streak', `${streak}d`],
                                                ].map(([k, v]) => (
                                                    <div key={k as string} className="rounded-lg bg-sunken px-2 py-1.5 text-center">
                                                        <div className="text-sm font-semibold">{v}</div>
                                                        <div className="text-[10px] text-subtle">{k}</div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="my-1 h-px bg-line" />
                                            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-red-500/10 hover:text-red-500">
                                                <LogOut className="size-4" /> Sign out
                                            </button>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </header>

                <main className={cn('relative min-h-0 flex-1', fullBleed ? 'overflow-hidden' : 'overflow-y-auto')}>
                    <motion.div
                        key={location.pathname.split('/')[1]}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className={cn(fullBleed ? 'h-full' : 'mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 md:pb-12 lg:px-10 lg:pt-10')}
                    >
                        {children}
                    </motion.div>
                </main>

                {/* ── Mobile tab bar ── */}
                <nav className="z-30 flex shrink-0 items-stretch justify-around border-t border-line bg-surface/90 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 backdrop-blur-xl md:hidden">
                    {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) => cn(
                                'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors',
                                isActive ? 'text-brand-500 dark:text-brand-300' : 'text-subtle',
                            )}
                        >
                            <Icon className="size-5" />
                            {label === 'Leaderboard' ? 'Ranks' : label.replace('AI ', '')}
                        </NavLink>
                    ))}
                </nav>
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </div>
    );
};

export default Layout;
