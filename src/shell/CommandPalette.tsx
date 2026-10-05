import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, LogOut, MessageSquarePlus, Moon, Search, Sparkles, Sun, Trophy, User } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useRoadmaps } from '../services/roadmapStore';
import { setActiveCourse } from '../lib/activeCourse';
import { Kbd } from '../ui';
import { NAV, useSignOut } from './nav';

const item = 'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted data-[selected=true]:bg-brand-500/10 data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:shrink-0';
const group = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-subtle';

const CommandPalette: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const navigate = useNavigate();
    const { theme, toggle } = useTheme();
    const signOut = useSignOut();
    const { roadmaps } = useRoadmaps();
    const [q, setQ] = useState('');
    const run = (fn: () => void) => { fn(); setQ(''); onClose(); };

    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={onClose} />
                    <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="panel relative w-full max-w-xl overflow-hidden shadow-2xl">
                        <Command loop onKeyDown={(e) => e.key === 'Escape' && onClose()}>
                            <div className="flex items-center gap-3 border-b-2 border-line px-4">
                                <Search className="size-5 text-subtle" />
                                <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search, or type a topic to learn…" className="h-14 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-subtle" />
                                <Kbd>esc</Kbd>
                            </div>
                            <Command.List className="max-h-[55vh] overflow-y-auto p-2">
                                <Command.Empty className="px-3 py-6 text-center text-sm text-subtle">Nothing found.</Command.Empty>
                                {q.trim().length > 1 && (
                                    <Command.Group heading="Learn something new" className={group}>
                                        <Command.Item value={`create ${q}`} onSelect={() => run(() => navigate(`/courses?new=${encodeURIComponent(q.trim())}`))} className={item}>
                                            <Sparkles className="text-brand-500" /> Create a course on “{q.trim()}”
                                        </Command.Item>
                                        <Command.Item value={`ask ${q}`} onSelect={() => run(() => navigate(`/tutor?ask=${encodeURIComponent(q.trim())}`))} className={item}>
                                            <MessageSquarePlus className="text-sky-500" /> Ask the tutor about “{q.trim()}”
                                        </Command.Item>
                                    </Command.Group>
                                )}
                                {roadmaps.length > 0 && (
                                    <Command.Group heading="Your courses" className={group}>
                                        {roadmaps.slice(0, 8).map((r) => (
                                            <Command.Item key={r.id} value={`course ${r.topic}`} onSelect={() => run(() => { setActiveCourse(r.id); navigate('/learn'); })} className={item}>
                                                <BookOpen /> {r.topic}
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                )}
                                <Command.Group heading="Go to" className={group}>
                                    {NAV.map(({ to, label, icon: Icon, hint }) => (
                                        <Command.Item key={to} value={`${label} ${hint}`} onSelect={() => run(() => navigate(to))} className={item}>
                                            <Icon /> <span className="flex-1">{label}</span> <span className="text-xs font-medium text-subtle">{hint}</span>
                                        </Command.Item>
                                    ))}
                                    <Command.Item value="leaderboard ranks league" onSelect={() => run(() => navigate('/community/leaderboard'))} className={item}><Trophy /> Leaderboard</Command.Item>
                                    <Command.Item value="profile stats badges" onSelect={() => run(() => navigate('/profile'))} className={item}><User /> Profile</Command.Item>
                                </Command.Group>
                                <Command.Group heading="Actions" className={group}>
                                    <Command.Item value="theme dark light" onSelect={() => run(toggle)} className={item}>{theme === 'dark' ? <Sun /> : <Moon />} Switch to {theme === 'dark' ? 'light' : 'dark'} mode</Command.Item>
                                    <Command.Item value="new chat" onSelect={() => run(() => navigate('/tutor?new=1'))} className={item}><MessageSquarePlus /> New tutor chat</Command.Item>
                                    <Command.Item value="sign out logout" onSelect={() => run(signOut)} className={item}><LogOut /> Sign out</Command.Item>
                                </Command.Group>
                            </Command.List>
                        </Command>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CommandPalette;
