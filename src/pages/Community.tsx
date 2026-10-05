import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Copy, Crown, Flame, Hash, LogIn, Medal, Plus, RefreshCw, Trophy, Users, Zap } from 'lucide-react';
import { aiService } from '../services/llamaService';
import * as api from '../services/apiService';
import { progressService, useProgress } from '../services/progressService';
import { useProfile } from '../lib/session';
import { PERSONAS, personaByName } from '../lib/personas';
import { cn } from '../lib/cn';
import { Avatar, Badge, Button, EmptyState, Modal, ProgressBar, Spinner } from '../ui';
import { BotMessage, Composer, PersonaAvatar, UserBubble, useSpeaker } from '../ui/chat';

interface Room { id: number; name: string; invite_code: string; member_count: number; last_message?: string; created_by: number; }
interface Member { id: number; name: string; picture?: string; }
interface RMsg { id: string; role: string; text: string; persona?: string | null; senderName?: string; senderId?: number | null; createdAt?: string; }
const toMsg = (m: any): RMsg => ({ id: `r${m.id}`, role: m.role, text: m.content, persona: m.persona, senderName: m.sender_name, senderId: m.user_id, createdAt: m.created_at });

// ── Leaderboard ─────────────────────────────────────
const TIERS = [
    { min: 5000, name: 'Diamond', color: 'from-cyan-300 to-sky-500', icon: '💎' },
    { min: 2500, name: 'Ruby', color: 'from-rose-400 to-red-500', icon: '♦️' },
    { min: 1000, name: 'Gold', color: 'from-amber-300 to-yellow-500', icon: '🥇' },
    { min: 300, name: 'Silver', color: 'from-slate-200 to-slate-400', icon: '🥈' },
    { min: 0, name: 'Bronze', color: 'from-orange-300 to-orange-600', icon: '🥉' },
];
const tierFor = (xp: number) => TIERS.find((t) => xp >= t.min) || TIERS[TIERS.length - 1];

const Leaderboard: React.FC = () => {
    const { xp } = useProgress();
    const [board, setBoard] = useState<api.LeaderboardResponse | null>(null);
    const [err, setErr] = useState(false);
    useEffect(() => { api.getLeaderboard(50).then(setBoard).catch(() => setErr(true)); }, []);
    const tier = tierFor(xp);
    const nextTier = [...TIERS].reverse().find((t) => t.min > xp);
    return (
        <div className="mx-auto max-w-3xl px-4 py-8">
            <div className="flex flex-col items-center text-center">
                <div className="flex items-end gap-2">
                    {TIERS.slice().reverse().map((t) => (
                        <div key={t.name} className={cn('flex items-center justify-center rounded-2xl bg-gradient-to-b text-2xl transition', t.color, t.name === tier.name ? 'size-20 text-4xl shadow-lg' : 'size-12 opacity-40 grayscale')}>{t.icon}</div>
                    ))}
                </div>
                <h1 className="mt-6 text-3xl font-extrabold">{tier.name} League</h1>
                <p className="mt-1 text-muted">{nextTier ? `${(nextTier.min - xp).toLocaleString()} XP to reach ${nextTier.name}` : 'Top tier — keep defending your spot!'}</p>
                {nextTier && <ProgressBar value={((xp - tier.min) / (nextTier.min - tier.min)) * 100} tone="amber" className="mt-4 max-w-xs" />}
            </div>
            <div className="mt-10">
                {err ? <EmptyState icon={<Trophy />} title="Rankings unavailable" description="Please try again in a moment." />
                    : !board ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
                        : board.leaders.length === 0 ? <EmptyState icon={<Trophy />} title="The board is empty" description="Complete a level to claim first place." />
                            : (
                                <div className="panel overflow-hidden">
                                    {board.leaders.map((u, i) => (
                                        <motion.div key={u.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                                            className={cn('flex items-center gap-4 border-b-2 border-line px-4 py-3 last:border-0', u.isMe && 'bg-brand-500/10')}>
                                            <span className="flex w-8 justify-center font-display text-lg font-extrabold">
                                                {u.rank === 1 ? <Crown className="size-6 text-amber-500" fill="currentColor" /> : u.rank === 2 ? <Medal className="size-6 text-slate-400" /> : u.rank === 3 ? <Medal className="size-6 text-orange-500" /> : <span className="text-subtle">{u.rank}</span>}
                                            </span>
                                            <Avatar src={u.picture} name={u.name} size={44} />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-bold">{u.isMe ? `${u.name} (you)` : u.name}</div>
                                                <div className="flex items-center gap-2 text-xs text-subtle">Level {u.level} · {tierFor(u.xp).icon} {tierFor(u.xp).name}{u.streak > 0 && <span className="flex items-center gap-0.5 text-orange-500"><Flame className="size-3" fill="currentColor" />{u.streak}</span>}</div>
                                            </div>
                                            <span className="font-display font-extrabold">{u.xp.toLocaleString()} XP</span>
                                        </motion.div>
                                    ))}
                                    {board.me && !board.leaders.some((l) => l.isMe) && (
                                        <div className="flex items-center gap-4 border-t-2 border-dashed border-line bg-brand-500/10 px-4 py-3">
                                            <span className="w-8 text-center font-display font-extrabold text-brand-600">{board.me.rank}</span>
                                            <span className="flex-1 font-bold">You</span>
                                            <span className="font-display font-extrabold">{board.me.xp.toLocaleString()} XP</span>
                                        </div>
                                    )}
                                </div>
                            )}
                {board && <p className="mt-3 text-center text-xs text-subtle">{board.total} learners ranked by total XP · names shortened for privacy</p>}
            </div>
        </div>
    );
};

// ── Community ───────────────────────────────────────
const Community: React.FC = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const profile = useProfile();
    const userId = progressService.getDbUserId();
    const isBoard = roomId === 'leaderboard';
    const [rooms, setRooms] = useState<Room[] | null>(null);
    const [room, setRoom] = useState<Room | null>(null);
    const [msgs, setMsgs] = useState<RMsg[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loadingRoom, setLoadingRoom] = useState(false);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [dialog, setDialog] = useState<'create' | 'join' | null>(null);
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [created, setCreated] = useState('');
    const [mention, setMention] = useState<string | null>(null);
    const speaker = useSpeaker();
    const lastId = useRef(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const stick = useRef(true);

    const loadRooms = useCallback(async () => {
        if (!userId) { setRooms([]); return; }
        try { setRooms((await api.getUserRooms(userId)) || []); } catch { setRooms([]); }
    }, [userId]);
    useEffect(() => { loadRooms(); }, [loadRooms]);

    // open room from URL
    useEffect(() => {
        if (!roomId || isBoard || !rooms) { setRoom(null); return; }
        const r = rooms.find((x) => String(x.id) === roomId);
        if (!r) { setRoom(null); return; }
        setRoom(r); setMsgs([]); lastId.current = 0; stick.current = true; setLoadingRoom(true);
        Promise.all([api.getRoomMessages(r.id), api.getRoomDetails(r.id)])
            .then(([m, d]) => { setMsgs(m.map(toMsg)); if (m.length) lastId.current = Math.max(...m.map((x: any) => x.id)); setMembers(d.members || []); })
            .catch((e) => toast.error('Couldn’t open the room', { description: e?.message }))
            .finally(() => setLoadingRoom(false));
    }, [roomId, rooms, isBoard]);

    useEffect(() => {
        if (!room) return;
        const t = setInterval(async () => {
            try {
                const fresh = await api.getRoomMessages(room.id, lastId.current || undefined);
                if (fresh.length) {
                    lastId.current = Math.max(lastId.current, ...fresh.map((m: any) => m.id));
                    setMsgs((p) => { const ids = new Set(p.map((m) => m.id)); return [...p, ...fresh.map(toMsg).filter((m: RMsg) => !ids.has(m.id))]; });
                }
            } catch { /* keep polling */ }
        }, 3000);
        return () => clearInterval(t);
    }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useLayoutEffect(() => { const el = scrollRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [msgs]);

    const onInput = (v: string) => {
        setInput(v);
        const at = v.lastIndexOf('@');
        setMention(at >= 0 && !/\s/.test(v.slice(at + 1)) ? v.slice(at + 1).toLowerCase() : null);
    };

    const send = async () => {
        const text = input.trim();
        if (!text || !room || busy) return;
        setInput(''); setMention(null); stick.current = true;
        const me = profile?.name || 'You';
        try {
            const saved = await api.postRoomMessage(room.id, { user_id: userId || undefined, sender_name: me, content: text, role: 'user' });
            setMsgs((p) => [...p, { id: `r${saved.id}`, role: 'user', text, senderName: me, senderId: userId, createdAt: saved.created_at }]);
            lastId.current = Math.max(lastId.current, saved.id);
        } catch (e: any) { toast.error('Message not sent', { description: e?.message }); setInput(text); return; }
        const called = Array.from(new Set((text.match(/@(\w+)/g) || []).map((m) => m.slice(1)))).map(personaByName).filter(Boolean) as typeof PERSONAS;
        if (!called.length) return;
        setBusy(true);
        for (const p of called) {
            const pid = `bot-${p.id}-${Date.now()}`;
            setMsgs((prev) => [...prev, { id: pid, role: 'bot', text: '', persona: p.name, senderName: p.name }]);
            try {
                let full = '';
                await aiService.chatStream([{ role: 'user', content: text }], (acc) => { full = acc; setMsgs((prev) => prev.map((m) => (m.id === pid ? { ...m, text: acc } : m))); }, p.prompt);
                if (full) {
                    const saved = await api.postRoomMessage(room.id, { sender_name: p.name, content: full, role: 'bot', persona: p.name });
                    setMsgs((prev) => prev.map((m) => (m.id === pid ? { ...m, id: `r${saved.id}` } : m)));
                    lastId.current = Math.max(lastId.current, saved.id);
                }
            } catch { setMsgs((prev) => prev.map((m) => (m.id === pid ? { ...m, text: `_${p.name} is unavailable right now._` } : m))); }
        }
        setBusy(false);
    };

    const createRoom = async () => {
        if (!userId || !name.trim()) return;
        try { const r = await api.createRoom({ user_id: userId, name: name.trim().slice(0, 100) }); setCreated(r.invite_code); setName(''); await loadRooms(); navigate(`/community/${r.id}`); }
        catch (e: any) { toast.error('Couldn’t create the room', { description: e?.message }); }
    };
    const joinRoom = async () => {
        if (!userId || !code.trim()) return;
        try { const r = await api.joinRoom({ user_id: userId, invite_code: code.trim() }); setCode(''); setDialog(null); await loadRooms(); toast.success('Joined!'); if (r?.id) navigate(`/community/${r.id}`); }
        catch { toast.error('That invite code didn’t work'); }
    };
    const regen = async () => {
        if (!room) return;
        try { const u = await api.regenerateInviteCode(room.id); setRoom({ ...room, invite_code: u.invite_code }); toast.success('New invite code — the old one stopped working'); }
        catch (e: any) { toast.error('Only the room’s creator can do that', { description: e?.message }); }
    };
    const copyCode = (c: string) => { navigator.clipboard?.writeText(c); toast.success('Invite code copied'); };

    const mentionList = mention !== null ? PERSONAS.filter((p) => p.name.toLowerCase().startsWith(mention)) : [];
    const showList = !roomId;

    return (
        <div className="flex h-full">
            {/* channels */}
            <aside className={cn('w-full shrink-0 flex-col border-r-2 border-line bg-surface md:flex md:w-72', showList ? 'flex' : 'hidden')}>
                <div className="p-4"><h1 className="text-2xl font-extrabold">Community</h1><p className="text-sm text-muted">Study together, climb the league.</p></div>
                <div className="px-2">
                    <Link to="/community/leaderboard" className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold', isBoard ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-sunken')}>
                        <span className="flex size-9 items-center justify-center rounded-xl bg-amber-400 text-white"><Trophy className="size-5" /></span> Leaderboard
                    </Link>
                </div>
                <div className="mt-4 flex items-center justify-between px-5 pb-1">
                    <span className="eyebrow">Study rooms</span>
                    <div className="flex gap-1">
                        <button onClick={() => setDialog('join')} className="rounded-lg p-1 text-subtle hover:bg-sunken hover:text-ink" title="Join with code"><LogIn className="size-4" /></button>
                        <button onClick={() => { setCreated(''); setDialog('create'); }} className="rounded-lg p-1 text-subtle hover:bg-sunken hover:text-ink" title="Create room"><Plus className="size-4" /></button>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                    {rooms === null ? [0, 1, 2].map((i) => <div key={i} className="skeleton mx-1 mb-2 h-12" />)
                        : rooms.length === 0 ? (
                            <div className="m-2 rounded-2xl border-2 border-dashed border-line p-4 text-center text-sm text-muted">
                                No rooms yet.
                                <div className="mt-3 flex justify-center gap-2"><Button size="xs" variant="primary" onClick={() => { setCreated(''); setDialog('create'); }}>Create</Button><Button size="xs" onClick={() => setDialog('join')}>Join</Button></div>
                            </div>
                        ) : rooms.map((r) => (
                            <Link key={r.id} to={`/community/${r.id}`} className={cn('mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2', String(r.id) === roomId ? 'bg-sunken text-ink' : 'text-muted hover:bg-sunken/70')}>
                                <Hash className="size-5 shrink-0 text-subtle" />
                                <div className="min-w-0 flex-1"><div className="truncate font-bold">{r.name}</div><div className="truncate text-xs text-subtle">{r.last_message || `${r.member_count} member${r.member_count === 1 ? '' : 's'}`}</div></div>
                            </Link>
                        ))}
                </div>
            </aside>

            {/* main */}
            <section className={cn('min-w-0 flex-1 flex-col', showList ? 'hidden md:flex' : 'flex')}>
                {isBoard ? (
                    <div className="h-full overflow-y-auto">
                        <div className="sticky top-0 z-10 border-b-2 border-line bg-bg/95 px-3 py-2 md:hidden"><Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => navigate('/community')}>Community</Button></div>
                        <Leaderboard />
                    </div>
                ) : !roomId ? (
                    <div className="flex h-full items-center justify-center p-6">
                        <EmptyState icon={<Users />} title="Study with friends — and famous minds"
                            description="Create a room, share its invite code, then type @Socrates, @Ada, @Newton or @Turing to bring an AI persona into the conversation."
                            action={<div className="flex gap-2"><Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setCreated(''); setDialog('create'); }}>Create room</Button><Button icon={<LogIn className="size-4" />} onClick={() => setDialog('join')}>Join</Button></div>} />
                    </div>
                ) : !room ? (
                    <div className="flex h-full items-center justify-center">{rooms === null ? <Spinner className="size-7" /> : <EmptyState icon={<Hash />} title="Room not found" action={<Link to="/community"><Button>Back</Button></Link>} />}</div>
                ) : (
                    <div className="flex h-full">
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex h-14 shrink-0 items-center gap-2 border-b-2 border-line px-3">
                                <button onClick={() => navigate('/community')} className="rounded-lg p-1.5 text-subtle hover:bg-sunken md:hidden"><ArrowLeft className="size-5" /></button>
                                <Hash className="size-5 text-subtle" />
                                <span className="truncate font-display text-lg font-bold">{room.name}</span>
                                <span className="ml-1 hidden text-sm text-subtle sm:inline">· type @ to summon a persona</span>
                                <button onClick={() => copyCode(room.invite_code)} className="ml-auto flex items-center gap-1.5 rounded-lg border-2 border-line px-2.5 py-1 font-mono text-xs font-bold tracking-widest xl:hidden"><Copy className="size-3" />{room.invite_code}</button>
                            </div>
                            <div ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} className="min-h-0 flex-1 overflow-y-auto">
                                {loadingRoom ? <div className="flex justify-center py-20"><Spinner className="size-7" /></div>
                                    : msgs.length === 0 ? (
                                        <div className="px-6 py-16 text-center">
                                            <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-sunken"><Hash className="size-8 text-subtle" /></div>
                                            <h2 className="mt-4 text-2xl font-extrabold">Welcome to #{room.name}</h2>
                                            <p className="mt-1 text-muted">This is the start of the room. Say hi, or ask @Socrates a question.</p>
                                        </div>
                                    ) : (
                                        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
                                            {msgs.map((m, i) => {
                                                if (m.role === 'system') return <div key={m.id} className="text-center text-xs font-semibold text-subtle">{m.text}</div>;
                                                const p = personaByName(m.persona);
                                                if (m.role === 'bot' || p) {
                                                    return <BotMessage key={m.id} id={m.id} text={m.text} name={p?.name || m.senderName || 'Assistant'} nameClass={p?.text} speaker={speaker} time={m.createdAt}
                                                        avatar={<PersonaAvatar emoji={p?.emoji || '🤖'} color={p?.color || 'bg-brand-500'} />} streaming={busy && i === msgs.length - 1} />;
                                                }
                                                const mine = String(m.senderId) === String(userId);
                                                const member = members.find((x) => String(x.id) === String(m.senderId));
                                                return <UserBubble key={m.id} text={m.text} mine={mine} name={m.senderName} time={m.createdAt} avatar={<Avatar src={member?.picture} name={m.senderName} size={32} />} />;
                                            })}
                                        </div>
                                    )}
                            </div>
                            <div className="shrink-0 px-3 pb-3 sm:px-5 sm:pb-4">
                                <Composer value={input} onChange={onInput} onSend={send} busy={busy} placeholder={`Message #${room.name}`}
                                    footer="Messages are visible to everyone in this room"
                                    above={
                                        <AnimatePresence>
                                            {mentionList.length > 0 && (
                                                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="panel absolute bottom-full left-0 mb-2 w-72 p-1.5">
                                                    <div className="px-2 py-1 text-xs font-bold text-subtle">Summon a persona</div>
                                                    {mentionList.map((p) => (
                                                        <button key={p.id} onClick={() => { const at = input.lastIndexOf('@'); setInput(`${input.slice(0, at)}@${p.name} `); setMention(null); }}
                                                            className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-sunken">
                                                            <PersonaAvatar emoji={p.emoji} color={p.color} size={28} />
                                                            <div><div className="text-sm font-bold">@{p.name}</div><div className="text-xs text-subtle">{p.tagline}</div></div>
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    } />
                            </div>
                        </div>
                        {/* room info */}
                        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l-2 border-line bg-surface p-4 xl:block">
                            <div className="rounded-2xl bg-brand-500 p-4 text-white">
                                <div className="text-xs font-bold uppercase tracking-wider text-white/70">Invite code</div>
                                <button onClick={() => copyCode(room.invite_code)} className="mt-1 flex w-full items-center justify-between font-mono text-2xl font-extrabold tracking-[0.2em]">{room.invite_code}<Copy className="size-4 opacity-70" /></button>
                                {room.created_by === userId && <button onClick={regen} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white"><RefreshCw className="size-3" /> New code</button>}
                            </div>
                            <div className="eyebrow mb-2 mt-6">Members — {members.length}</div>
                            {members.map((m) => (
                                <div key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                                    <Avatar src={m.picture} name={m.name} size={32} />
                                    <span className="truncate text-sm font-semibold">{String(m.id) === String(userId) ? `${m.name} (you)` : m.name}</span>
                                    {m.id === room.created_by && <Crown className="ml-auto size-4 text-amber-500" />}
                                </div>
                            ))}
                            <div className="eyebrow mb-2 mt-6">AI personas</div>
                            {PERSONAS.map((p) => (
                                <button key={p.id} onClick={() => setInput((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}@${p.name} `)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-sunken">
                                    <PersonaAvatar emoji={p.emoji} color={p.color} size={32} />
                                    <div><div className="text-sm font-bold">@{p.name}</div><div className="text-xs text-subtle">{p.tagline}</div></div>
                                </button>
                            ))}
                        </aside>
                    </div>
                )}
            </section>

            <Modal open={dialog === 'create'} onClose={() => setDialog(null)} title={created ? 'Room created 🎉' : 'Create a study room'} description={created ? 'Share this code so friends can join.' : 'Give your room a name.'}>
                {created ? (
                    <div className="text-center">
                        <button onClick={() => copyCode(created)} className="mx-auto flex items-center gap-3 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-500/5 px-6 py-4 font-mono text-3xl font-extrabold tracking-[0.3em] text-brand-600 dark:text-brand-300">{created}<Copy className="size-5 opacity-60" /></button>
                        <Button className="mt-6" variant="primary" icon={<Check className="size-4" />} onClick={() => setDialog(null)}>Done</Button>
                    </div>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); createRoom(); }} className="flex gap-2">
                        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. ML study group" className="input" />
                        <Button type="submit" variant="primary" disabled={!name.trim()}>Create</Button>
                    </form>
                )}
            </Modal>
            <Modal open={dialog === 'join'} onClose={() => setDialog(null)} title="Join a room" description="Enter the 8-character invite code.">
                <form onSubmit={(e) => { e.preventDefault(); joinRoom(); }} className="flex gap-2">
                    <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="A1B2C3D4" className="input text-center font-mono text-lg tracking-[0.3em]" />
                    <Button type="submit" variant="primary" disabled={!code.trim()}>Join</Button>
                </form>
            </Modal>
        </div>
    );
};

export default Community;
