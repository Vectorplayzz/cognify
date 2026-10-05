import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ChevronDown, Globe, PanelLeftClose, PanelLeftOpen, Pencil, Search, SquarePen, Trash2 } from 'lucide-react';
import { aiService } from '../services/llamaService';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';
import { useProfile } from '../lib/session';
import { firstName } from '../lib/format';
import { ALL_TUTORS, COGNIFY_TUTOR, Persona } from '../lib/personas';
import { cn } from '../lib/cn';
import { Button, Drawer, Spinner } from '../ui';
import { useConfirm } from '../ui/useConfirm';
import { BotMessage, Composer, PersonaAvatar, UserBubble, useSpeaker } from '../ui/chat';
import { LogoMark } from '../shell/Logo';

interface Msg { id: string; role: 'user' | 'assistant' | 'error'; text: string; createdAt?: string; }
interface Session { id: number; title: string; first_message?: string; updated_at: string; }

const STARTERS = [
    { emoji: '🧠', title: 'Explain a concept', body: 'Explain how backpropagation works, like I’m new to it.' },
    { emoji: '📝', title: 'Quiz me', body: 'Give me 5 quick questions to test my understanding of SQL joins.' },
    { emoji: '🗺️', title: 'Make a plan', body: 'Make me a 2-week study plan to get comfortable with React.' },
    { emoji: '🐛', title: 'Debug with me', body: 'Why might a recursive function cause a stack overflow? How do I fix it?' },
];
const HISTORY_LIMIT = 24;

function groupByDate(list: Session[]) {
    const now = new Date();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const g: Record<string, Session[]> = { Today: [], Yesterday: [], 'Previous 7 days': [], 'Previous 30 days': [], Older: [] };
    for (const s of list) {
        const t = new Date(s.updated_at).getTime();
        if (t >= t0) g.Today.push(s); else if (t >= t0 - 864e5) g.Yesterday.push(s);
        else if (t >= t0 - 7 * 864e5) g['Previous 7 days'].push(s); else if (t >= t0 - 30 * 864e5) g['Previous 30 days'].push(s); else g.Older.push(s);
    }
    return Object.entries(g).filter(([, v]) => v.length);
}
const titleOf = (s: Session) => (s.title && s.title !== 'New Chat' ? s.title : s.first_message || 'New chat');

const Tutor: React.FC = () => {
    const profile = useProfile();
    const [params, setParams] = useSearchParams();
    const userId = progressService.getDbUserId();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(true);
    const [active, setActive] = useState<Session | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [searching, setSearching] = useState(false);
    const [tutor, setTutor] = useState<Persona>(COGNIFY_TUTOR);
    const [picker, setPicker] = useState(false);
    const [sidebar, setSidebar] = useState(true);
    const [drawer, setDrawer] = useState(false);
    const [filter, setFilter] = useState('');
    const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);
    const [confirmNode, confirm] = useConfirm();
    const speaker = useSpeaker();
    const scrollRef = useRef<HTMLDivElement>(null);
    const stick = useRef(true);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const loadSessions = useCallback(async () => {
        if (!userId) { setLoadingSessions(false); return; }
        try { setSessions((await api.listChatSessions(userId)) || []); } catch { /* ignore */ } finally { setLoadingSessions(false); }
    }, [userId]);
    useEffect(() => { loadSessions(); }, [loadSessions]);

    useLayoutEffect(() => { const el = scrollRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [msgs]);

    const newChat = () => { setActive(null); setMsgs([]); setDrawer(false); setTimeout(() => inputRef.current?.focus(), 50); };

    const open = async (s: Session) => {
        setActive(s); setDrawer(false); setLoadingMsgs(true); stick.current = true;
        try {
            const rows = await api.getSessionMessages(s.id);
            setMsgs(rows.map((m: any, i: number) => ({ id: `s${m.id || i}`, role: m.role === 'user' ? 'user' : 'assistant', text: m.content, createdAt: m.created_at })));
        } catch (err: any) { toast.error('Couldn’t open that chat', { description: err?.message }); }
        finally { setLoadingMsgs(false); }
    };

    const send = async (textArg?: string) => {
        const text = (textArg ?? input).trim();
        if (!text || busy) return;
        setInput(''); setBusy(true); stick.current = true;
        let session = active;
        if (userId && !session) {
            try { session = await api.createChatSession(userId); setActive(session); setSessions((p) => [{ ...session!, first_message: text, updated_at: new Date().toISOString() }, ...p]); } catch { /* local only */ }
        }
        const u: Msg = { id: `u${Date.now()}`, role: 'user', text };
        const a: Msg = { id: `a${Date.now()}`, role: 'assistant', text: '' };
        const history = [...msgs, u].filter((m) => m.role !== 'error' && m.text).slice(-HISTORY_LIMIT).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
        setMsgs((p) => [...p, u, a]);
        if (userId && session) api.saveMessage({ user_id: userId, session_id: session.id, role: 'user', content: text }).catch(() => {});
        try {
            setSearching(aiService.shouldUseWebSearch(text));
            let full = '';
            await aiService.chatStream(history, (acc) => { full = acc; setSearching(false); setMsgs((p) => p.map((m) => (m.id === a.id ? { ...m, text: acc } : m))); }, tutor.prompt);
            if (userId && session && full) api.saveMessage({ user_id: userId, session_id: session.id, role: 'assistant', content: full }).then(loadSessions).catch(() => {});
        } catch (err: any) {
            setMsgs((p) => p.map((m) => (m.id === a.id ? { ...m, role: 'error', text: err?.message || 'The tutor couldn’t answer just now.' } : m)));
        } finally { setBusy(false); setSearching(false); }
    };

    const regenerate = () => {
        const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
        if (!lastUser || busy) return;
        setMsgs((p) => p.slice(0, p.lastIndexOf(lastUser)));
        setTimeout(() => send(lastUser.text), 0);
    };

    const remove = async (s: Session) => {
        if (!(await confirm({ title: 'Delete this chat?', description: `“${titleOf(s)}” will be permanently removed.`, confirmLabel: 'Delete', danger: true }))) return;
        try { await api.deleteChatSession(s.id); setSessions((p) => p.filter((x) => x.id !== s.id)); if (active?.id === s.id) newChat(); }
        catch (err: any) { toast.error('Delete failed', { description: err?.message }); }
    };
    const rename = async () => {
        if (!renaming) return;
        const t = renaming.title.trim().slice(0, 200); setRenaming(null);
        if (!t) return;
        try { await api.updateChatSession(renaming.id, t); setSessions((p) => p.map((s) => (s.id === renaming.id ? { ...s, title: t } : s))); }
        catch (err: any) { toast.error('Rename failed', { description: err?.message }); }
    };
    const clearAll = async () => {
        if (!userId || !(await confirm({ title: 'Delete all chats?', description: 'Every tutor conversation will be removed. This can’t be undone.', confirmLabel: 'Delete all', danger: true }))) return;
        try { await api.clearAllChat(userId); setSessions([]); newChat(); toast.success('All chats deleted'); } catch (err: any) { toast.error('Failed', { description: err?.message }); }
    };

    useEffect(() => {
        const ask = params.get('ask');
        if (params.get('new')) { setParams({}, { replace: true }); newChat(); }
        else if (ask) { setParams({}, { replace: true }); newChat(); setInput(ask); }
    }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

    const filtered = sessions.filter((s) => titleOf(s).toLowerCase().includes(filter.toLowerCase()));

    const history = (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between p-3">
                <button onClick={() => setSidebar(false)} className="hidden rounded-lg p-2 text-subtle hover:bg-sunken hover:text-ink lg:block" title="Close sidebar"><PanelLeftClose className="size-5" /></button>
                <span className="font-display font-bold lg:hidden">Chats</span>
                <button onClick={newChat} className="rounded-lg p-2 text-subtle hover:bg-sunken hover:text-ink" title="New chat"><SquarePen className="size-5" /></button>
            </div>
            <div className="px-3 pb-2">
                <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                    <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" className="input h-10 pl-9" /></div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {loadingSessions ? [0, 1, 2, 3].map((i) => <div key={i} className="skeleton mx-1 mb-2 h-9" />)
                    : filtered.length === 0 ? <p className="px-3 py-8 text-center text-sm text-subtle">{sessions.length ? 'No matches' : 'Your chats will appear here.'}</p>
                        : groupByDate(filtered).map(([label, list]) => (
                            <div key={label} className="mb-3">
                                <div className="px-3 py-1.5 text-xs font-bold text-subtle">{label}</div>
                                {list.map((s) => (
                                    <div key={s.id} onClick={() => renaming?.id !== s.id && open(s)}
                                        className={cn('group flex cursor-pointer items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium', active?.id === s.id ? 'bg-sunken text-ink' : 'text-muted hover:bg-sunken/70')}>
                                        {renaming?.id === s.id ? (
                                            <input autoFocus value={renaming.title} onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} onBlur={rename}
                                                onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setRenaming(null); }}
                                                className="h-7 flex-1 rounded-lg border-2 border-brand-400 bg-surface px-2 outline-none" />
                                        ) : <span className="flex-1 truncate">{titleOf(s)}</span>}
                                        <button onClick={(e) => { e.stopPropagation(); setRenaming({ id: s.id, title: titleOf(s) }); }} className="hidden rounded p-1 text-subtle hover:text-ink group-hover:block"><Pencil className="size-3.5" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); remove(s); }} className="hidden rounded p-1 text-subtle hover:text-red-500 group-hover:block"><Trash2 className="size-3.5" /></button>
                                    </div>
                                ))}
                            </div>
                        ))}
            </div>
            {sessions.length > 0 && <button onClick={clearAll} className="m-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-subtle hover:bg-red-500/10 hover:text-red-500"><Trash2 className="size-3.5" /> Delete all chats</button>}
        </div>
    );

    const avatarFor = (t: Persona) => (t.id === 'cognify' ? <LogoMark className="size-8" /> : <PersonaAvatar emoji={t.emoji} color={t.color} />);

    return (
        <div className="flex h-full">
            {confirmNode}
            <AnimatePresence initial={false}>
                {sidebar && (
                    <motion.aside initial={{ width: 0 }} animate={{ width: 280 }} exit={{ width: 0 }} transition={{ duration: 0.2 }} className="hidden shrink-0 overflow-hidden border-r-2 border-line bg-surface lg:block">
                        <div className="h-full w-[280px]">{history}</div>
                    </motion.aside>
                )}
            </AnimatePresence>
            <Drawer open={drawer} onClose={() => setDrawer(false)}>{history}</Drawer>

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-14 shrink-0 items-center gap-2 px-3">
                    {!sidebar && <button onClick={() => setSidebar(true)} className="hidden rounded-lg p-2 text-subtle hover:bg-sunken lg:block" title="Open sidebar"><PanelLeftOpen className="size-5" /></button>}
                    <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-subtle hover:bg-sunken lg:hidden"><PanelLeftOpen className="size-5" /></button>
                    <div className="relative">
                        <button onClick={() => setPicker((p) => !p)} className="flex items-center gap-2 rounded-xl px-3 py-2 font-display text-lg font-bold hover:bg-sunken">
                            {tutor.name} <ChevronDown className={cn('size-4 text-subtle transition', picker && 'rotate-180')} />
                        </button>
                        <AnimatePresence>
                            {picker && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setPicker(false)} />
                                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="panel absolute left-0 top-12 z-30 w-72 p-1.5">
                                        <div className="px-3 py-2 text-xs font-bold text-subtle">Choose your tutor</div>
                                        {ALL_TUTORS.map((t) => (
                                            <button key={t.id} onClick={() => { setTutor(t); setPicker(false); }} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-sunken', tutor.id === t.id && 'bg-brand-500/10')}>
                                                {avatarFor(t)}
                                                <div className="flex-1"><div className="text-sm font-bold">{t.name}</div><div className="text-xs text-subtle">{t.tagline}</div></div>
                                            </button>
                                        ))}
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                    <Button variant="ghost" size="icon-sm" className="ml-auto lg:hidden" onClick={newChat} title="New chat"><SquarePen className="size-5" /></Button>
                </div>

                <div ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} className="min-h-0 flex-1 overflow-y-auto">
                    {loadingMsgs ? <div className="flex justify-center py-24"><Spinner className="size-7" /></div>
                        : msgs.length === 0 ? (
                            <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-[8vh] text-center">
                                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                                    {tutor.id === 'cognify' ? <LogoMark className="size-16" /> : <PersonaAvatar emoji={tutor.emoji} color={tutor.color} size={64} />}
                                </motion.div>
                                <h1 className="mt-6 text-3xl font-extrabold sm:text-4xl">Hi {firstName(profile?.name)}, what are we learning?</h1>
                                <p className="mt-2 text-muted">{tutor.id === 'cognify' ? 'I remember this conversation and can search the web for fresh facts.' : `You’re talking with ${tutor.name} — ${tutor.tagline.toLowerCase()}.`}</p>
                                <div className="mt-10 grid w-full gap-3 sm:grid-cols-2">
                                    {STARTERS.map((s, i) => (
                                        <motion.button key={s.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}
                                            onClick={() => send(s.body)} className="panel panel-press flex gap-3 p-4 text-left">
                                            <span className="text-2xl">{s.emoji}</span>
                                            <div><div className="font-bold">{s.title}</div><div className="mt-0.5 text-sm text-muted">{s.body}</div></div>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mx-auto max-w-3xl space-y-7 px-4 py-6">
                                {msgs.map((m, i) => m.role === 'user' ? <UserBubble key={m.id} text={m.text} />
                                    : m.role === 'error' ? (
                                        <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                                            <span>{m.text}</span>
                                            {i === msgs.length - 1 && <Button variant="secondary" size="xs" onClick={regenerate}>Retry</Button>}
                                        </div>
                                    ) : (
                                        <BotMessage key={m.id} id={m.id} text={m.text} name={tutor.name} avatar={avatarFor(tutor)} speaker={speaker} time={m.createdAt}
                                            streaming={busy && i === msgs.length - 1}
                                            status={searching ? <><Globe className="size-4 animate-pulse text-sky-500" /> Searching the web…</> : undefined}
                                            onRegenerate={i === msgs.length - 1 ? regenerate : undefined} />
                                    ))}
                            </div>
                        )}
                </div>

                <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
                    <Composer value={input} onChange={setInput} onSend={() => send()} busy={busy} inputRef={inputRef}
                        placeholder={`Message ${tutor.name}…`} footer="Enter to send · Shift + Enter for a new line · AI can make mistakes" />
                </div>
            </div>
        </div>
    );
};

export default Tutor;
