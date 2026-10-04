import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, LogOut, MessageSquarePlus, Moon, Search, Sparkles, Sun } from 'lucide-react';
import { NAV_ITEMS, useSignOut } from './nav';
import { useTheme } from '../lib/theme';
import { Kbd } from './ui';

const itemClass =
    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted data-[selected=true]:bg-brand-500/10 data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:shrink-0';
const groupClass = '[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3';

const CommandPalette: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const navigate = useNavigate();
    const { theme, toggle } = useTheme();
    const signOut = useSignOut();
    const [query, setQuery] = useState('');

    const run = (fn: () => void) => {
        fn();
        setQuery('');
        onClose();
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: -8 }}
                        transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                        className="card relative w-full max-w-xl overflow-hidden bg-elevated"
                    >
                        <Command label="Command palette" loop onKeyDown={(e) => e.key === 'Escape' && onClose()}>
                            <div className="flex items-center gap-3 border-b border-line px-4">
                                <Search className="size-4 text-subtle" />
                                <Command.Input
                                    autoFocus
                                    value={query}
                                    onValueChange={setQuery}
                                    placeholder="Search pages, or type a topic to learn…"
                                    className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-subtle"
                                />
                                <Kbd>esc</Kbd>
                            </div>
                            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                                <Command.Empty className="px-3 py-6 text-center text-sm text-subtle">Nothing matches.</Command.Empty>

                                {query.trim().length > 1 && (
                                    <Command.Group heading="Learn" className={groupClass}>
                                        <Command.Item
                                            value={`learn ${query}`}
                                            onSelect={() => run(() => navigate(`/roadmap?learn=${encodeURIComponent(query.trim())}`))}
                                            className={itemClass}
                                        >
                                            <Sparkles className="text-brand-400" />
                                            Build a roadmap for “{query.trim()}”
                                        </Command.Item>
                                        <Command.Item
                                            value={`ask ${query}`}
                                            onSelect={() => run(() => navigate(`/chatbot?ask=${encodeURIComponent(query.trim())}`))}
                                            className={itemClass}
                                        >
                                            <MessageSquarePlus className="text-cyan-500" />
                                            Ask the tutor about “{query.trim()}”
                                        </Command.Item>
                                    </Command.Group>
                                )}

                                <Command.Group heading="Go to" className={groupClass}>
                                    {NAV_ITEMS.map(({ to, label, icon: Icon, description }) => (
                                        <Command.Item key={to} value={`${label} ${description}`} onSelect={() => run(() => navigate(to))} className={itemClass}>
                                            <Icon />
                                            <span className="flex-1">{label}</span>
                                            <span className="text-xs text-subtle">{description}</span>
                                            <ArrowRight className="opacity-40" />
                                        </Command.Item>
                                    ))}
                                </Command.Group>

                                <Command.Group heading="Actions" className={groupClass}>
                                    <Command.Item value="toggle theme dark light mode" onSelect={() => run(toggle)} className={itemClass}>
                                        {theme === 'dark' ? <Sun /> : <Moon />}
                                        Switch to {theme === 'dark' ? 'light' : 'dark'} mode
                                    </Command.Item>
                                    <Command.Item value="new chat conversation" onSelect={() => run(() => navigate('/chatbot?new=1'))} className={itemClass}>
                                        <MessageSquarePlus />
                                        New tutor conversation
                                    </Command.Item>
                                    <Command.Item value="sign out log out" onSelect={() => run(signOut)} className={itemClass}>
                                        <LogOut />
                                        Sign out
                                    </Command.Item>
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
