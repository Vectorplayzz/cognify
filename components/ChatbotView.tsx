import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
    ArrowLeft, ArrowUp, Bot, Check, Copy, Globe, Hash, LogIn, Mic, MessageSquarePlus, PanelLeft, Pencil,
    Plus, RefreshCw, Search, Square, Trash2, Users, Volume2, VolumeX, X,
} from 'lucide-react';
import { aiService } from '../services/llamaService';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';
import { useProfile } from '../lib/session';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';
import { Avatar, Badge, Button, EmptyState, Modal, Segmented, Spinner } from './ui';
import { useConfirm } from './ui/useConfirm';
import Markdown from './ui/Markdown';
import { LogoMark } from './Logo';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'bot';
    text: string;
    persona?: string;
    senderName?: string;
    senderId?: number | null;
    createdAt?: string;
}
interface ChatSession { id: number; title: string; message_count: number; first_message?: string; created_at: string; updated_at: string; }
interface Room { id: number; name: string; invite_code: string; member_count: number; last_message?: string; created_by: number; }
interface RoomMember { id: number; name: string; picture?: string; }

const PERSONAS = [
    { name: 'Socrates', emoji: '🏛️', color: 'from-amber-500 to-orange-600', text: 'text-amber-500', tagline: 'Teaches by questioning', prompt: 'You are Socrates, the ancient Greek philosopher. Teach through asking probing questions. Use the Socratic method. Be brief but thought-provoking.' },
    { name: 'Ada', emoji: '⚙️', color: 'from-pink-500 to-rose-600', text: 'text-pink-500', tagline: 'Patterns & algorithms', prompt: 'You are Ada Lovelace, the first computer programmer. Explain things with precision and elegance. Focus on patterns and algorithms. Be concise.' },
    { name: 'Newton', emoji: '🍎', color: 'from-emerald-500 to-green-600', text: 'text-emerald-500', tagline: 'First principles', prompt: 'You are Isaac Newton. Explain using first principles and scientific reasoning. Draw analogies to physics. Be methodical and brief.' },
    { name: 'Turing', emoji: '🧠', color: 'from-sky-500 to-cyan-600', text: 'text-sky-500', tagline: 'Logic & computation', prompt: 'You are Alan Turing. Focus on computation, logic, and problem-solving. Think about edge cases. Be analytical and concise.' },
];
const personaOf = (name?: string) => PERSONAS.find((p) => p.name.toLowerCase() === (name || '').toLowerCase());

const TUTOR_PROMPT = 'You are a senior AI Learning Tutor at Cognify. Explain complex concepts simply, use analogies, and encourage students. Be concise but thorough. Format answers with markdown (headings, lists, code blocks) when it helps. You have the conversation history above: reference earlier context and remember what the user told you.';

const SUGGESTIONS = [
    { title: 'Explain like I’m new', body: 'How does a neural network actually learn?' },
    { title: 'Compare', body: 'SQL vs NoSQL — when should I pick each?' },
    { title: 'Debug with me', body: 'Why would a Python list comprehension be slower than expected?' },
    { title: 'Plan', body: 'Give me a 2-week plan to get comfortable with React.' },
];

const HISTORY_LIMIT = 24; // messages of context sent to the model

const toRoomMessage = (m: any): Message => ({
    id: `room-${m.id}`, role: m.role, text: m.content, persona: m.persona || undefined,
    senderName: m.sender_name, senderId: m.user_id, createdAt: m.created_at,
});

function groupSessions(sessions: ChatSession[]) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const groups: Record<string, ChatSession[]> = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] };
    for (const s of sessions) {
        const t = new Date(s.updated_at).getTime();
        if (t >= today) groups.Today.push(s);
        else if (t >= today - 86400000) groups.Yesterday.push(s);
        else if (t >= today - 7 * 86400000) groups['Previous 7 days'].push(s);
        else groups.Older.push(s);
    }
    return Object.entries(groups).filter(([, v]) => v.length);
}

type Mode = 'tutor' | 'rooms';

const ChatbotView: React.FC = () => {
    const profile = useProfile();
    const [params, setParams] = useSearchParams();
    const [mode, setMode] = useState<Mode>('tutor');
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [speakingId, setSpeakingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);

    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
    const [loadingSessions, setLoadingSessions] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sessionFilter, setSessionFilter] = useState('');
    const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);

    const [rooms, setRooms] = useState<Room[]>([]);
    const [loadingRooms, setLoadingRooms] = useState(false);
    const [activeRoom, setActiveRoom] = useState<Room | null>(null);
    const [roomMessages, setRoomMessages] = useState<Message[]>([]);
    const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
    const [roomDialog, setRoomDialog] = useState<'create' | 'join' | null>(null);
    const [roomName, setRoomName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [createdCode, setCreatedCode] = useState('');
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');

    const [confirmNode, confirm] = useConfirm();
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<any>(null);
    const lastMsgIdRef = useRef(0);
    const stickToBottom = useRef(true);
    const userId = progressService.getDbUserId();

    const inRoom = mode === 'rooms' && !!activeRoom;
    const shown = inRoom ? roomMessages : messages;

    // ── data loading ──
    const loadSessions = useCallback(async () => {
        if (!userId) { setLoadingSessions(false); return; }
        try { setSessions((await api.listChatSessions(userId)) || []); }
        catch (err) { console.error('[Chat] sessions', err); }
        finally { setLoadingSessions(false); }
    }, [userId]);

    const loadRooms = useCallback(async () => {
        if (!userId) return;
        setLoadingRooms(true);
        try { setRooms((await api.getUserRooms(userId)) || []); }
        catch (err) { console.error('[Chat] rooms', err); }
        finally { setLoadingRooms(false); }
    }, [userId]);

    useEffect(() => { loadSessions(); }, [loadSessions]);
    useEffect(() => { if (mode === 'rooms') loadRooms(); }, [mode, loadRooms]);

    // ── scrolling: follow new tokens unless the reader scrolled up ──
    const onScroll = () => {
        const el = scrollRef.current;
        if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
    }, [shown]);

    // ── room polling ──
    useEffect(() => {
        if (!inRoom || !activeRoom) return;
        const poll = async () => {
            try {
                const fresh = await api.getRoomMessages(activeRoom.id, lastMsgIdRef.current || undefined);
                if (fresh.length) {
                    lastMsgIdRef.current = Math.max(lastMsgIdRef.current, ...fresh.map((m: any) => m.id));
                    setRoomMessages((prev) => {
                        const ids = new Set(prev.map((m) => m.id));
                        return [...prev, ...fresh.map(toRoomMessage).filter((m: Message) => !ids.has(m.id))];
                    });
                }
            } catch { /* keep polling */ }
        };
        const t = setInterval(poll, 3000);
        return () => clearInterval(t);
    }, [inRoom, activeRoom?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── textarea autosize ──
    useLayoutEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, [input]);

    // ── speech ──
    const toggleListening = () => {
        if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { toast.error('Voice input isn’t supported in this browser', { description: 'Try Chrome or Edge.' }); return; }
        try {
            const rec = new SR();
            rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
            let finalText = '';
            rec.onresult = (e: any) => {
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
                    else interim += e.results[i][0].transcript;
                }
                setInput((finalText + interim).trim());
            };
            rec.onend = () => { setIsListening(false); inputRef.current?.focus(); };
            rec.onerror = (e: any) => {
                setIsListening(false);
                if (e.error === 'not-allowed') toast.error('Microphone access was blocked');
            };
            rec.start();
            recognitionRef.current = rec;
            setIsListening(true);
        } catch (err) { console.error('speech', err); }
    };

    const toggleSpeak = (id: string, text: string) => {
        if (speakingId === id) { window.speechSynthesis.cancel(); setSpeakingId(null); return; }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.replace(/[#*`_>]/g, ''));
        u.onend = () => setSpeakingId(null);
        u.onerror = () => setSpeakingId(null);
        window.speechSynthesis.speak(u);
        setSpeakingId(id);
    };
    useEffect(() => () => { window.speechSynthesis?.cancel(); recognitionRef.current?.stop(); }, []);

    const copyMessage = (id: string, text: string) => {
        navigator.clipboard?.writeText(text).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); });
    };

    // ── tutor ──
    const newChat = () => {
        setActiveSession(null);
        setMessages([]);
        setPanelOpen(false);
        setMode('tutor');
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const openSession = async (s: ChatSession) => {
        setMode('tutor');
        setActiveSession(s);
        setPanelOpen(false);
        setLoadingMessages(true);
        stickToBottom.current = true;
        try {
            const msgs = await api.getSessionMessages(s.id);
            setMessages(msgs.map((m: any, i: number) => ({ id: `s-${m.id || i}`, role: m.role, text: m.content, createdAt: m.created_at })));
        } catch (err: any) {
            toast.error('Couldn’t open that conversation', { description: err?.message });
        } finally {
            setLoadingMessages(false);
        }
    };

    const deleteSession = async (s: ChatSession) => {
        const ok = await confirm({ title: 'Delete this conversation?', description: 'Its messages will be permanently removed.', confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        try {
            await api.deleteChatSession(s.id);
            if (activeSession?.id === s.id) newChat();
            setSessions((prev) => prev.filter((x) => x.id !== s.id));
        } catch (err: any) { toast.error('Delete failed', { description: err?.message }); }
    };

    const saveRename = async () => {
        if (!renaming) return;
        const title = renaming.title.trim().slice(0, 200);
        setRenaming(null);
        if (!title) return;
        try {
            await api.updateChatSession(renaming.id, title);
            setSessions((prev) => prev.map((s) => (s.id === renaming.id ? { ...s, title, first_message: undefined } : s)));
        } catch (err: any) { toast.error('Rename failed', { description: err?.message }); }
    };

    const clearAll = async () => {
        const ok = await confirm({ title: 'Clear all conversations?', description: 'Every tutor conversation will be deleted. This can’t be undone.', confirmLabel: 'Clear all', danger: true });
        if (!ok || !userId) return;
        try {
            await api.clearAllChat(userId);
            setSessions([]);
            newChat();
            toast.success('All conversations cleared');
        } catch (err: any) { toast.error('Clear failed', { description: err?.message }); }
    };

    const sendTutor = async (text: string) => {
        setIsGenerating(true);
        stickToBottom.current = true;
        let session = activeSession;
        if (userId && !session) {
            try {
                session = await api.createChatSession(userId);
                setActiveSession(session);
            } catch (err) { console.error('[Chat] create session', err); }
        }
        const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text };
        const placeholder: Message = { id: `a-${Date.now()}`, role: 'assistant', text: '' };
        const history = [...messages, userMsg]
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text)
            .slice(-HISTORY_LIMIT)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
        setMessages((prev) => [...prev, userMsg, placeholder]);

        if (userId && session) {
            api.saveMessage({ user_id: userId, session_id: session.id, role: 'user', content: text }).catch((e) => console.error(e));
        }
        try {
            setIsSearching(aiService.shouldUseWebSearch(text));
            let full = '';
            await aiService.chatStream(history, (acc) => {
                full = acc;
                setIsSearching(false);
                setMessages((prev) => prev.map((m) => (m.id === placeholder.id ? { ...m, text: acc } : m)));
            }, TUTOR_PROMPT);
            if (userId && session && full) {
                api.saveMessage({ user_id: userId, session_id: session.id, role: 'assistant', content: full })
                    .then(loadSessions)
                    .catch((e) => console.error(e));
            }
        } catch (err: any) {
            console.error('[Chat] stream', err);
            setMessages((prev) => prev.map((m) => (m.id === placeholder.id
                ? { ...m, role: 'system', text: `The tutor couldn’t answer just now. ${err?.message ? `(${err.message})` : ''}` }
                : m)));
        } finally {
            setIsGenerating(false);
            setIsSearching(false);
        }
    };

    const retryLast = () => {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        if (!lastUser || isGenerating) return;
        setMessages((prev) => prev.slice(0, prev.lastIndexOf(lastUser)));
        sendTutor(lastUser.text);
    };

    // ── rooms ──
    const enterRoom = async (room: Room) => {
        setActiveRoom(room);
        setRoomMessages([]);
        setPanelOpen(false);
        lastMsgIdRef.current = 0;
        stickToBottom.current = true;
        setLoadingMessages(true);
        try {
            const [msgs, details] = await Promise.all([api.getRoomMessages(room.id), api.getRoomDetails(room.id)]);
            setRoomMessages(msgs.map(toRoomMessage));
            if (msgs.length) lastMsgIdRef.current = Math.max(...msgs.map((m: any) => m.id));
            setRoomMembers(details.members || []);
        } catch (err: any) {
            toast.error('Couldn’t open the room', { description: err?.message });
        } finally {
            setLoadingMessages(false);
        }
    };

    const sendRoom = async (text: string) => {
        if (!activeRoom) return;
        const myName = profile?.name || 'You';
        stickToBottom.current = true;
        try {
            const saved = await api.postRoomMessage(activeRoom.id, { user_id: userId || undefined, sender_name: myName, content: text, role: 'user' });
            setRoomMessages((prev) => [...prev, { id: `room-${saved.id}`, role: 'user', text, senderName: myName, senderId: userId }]);
            lastMsgIdRef.current = Math.max(lastMsgIdRef.current, saved.id);
        } catch (err: any) {
            toast.error('Message not sent', { description: err?.message });
            setInput(text);
            return;
        }
        const mentioned = Array.from(new Set((text.match(/@(\w+)/g) || []).map((m) => m.slice(1).toLowerCase())))
            .map((n) => personaOf(n)).filter(Boolean) as typeof PERSONAS;
        if (!mentioned.length) return;
        setIsGenerating(true);
        for (const p of mentioned) {
            const pid = `bot-${p.name}-${Date.now()}`;
            setRoomMessages((prev) => [...prev, { id: pid, role: 'bot', text: '', persona: p.name, senderName: p.name, senderId: null }]);
            try {
                let full = '';
                await aiService.chatStream([{ role: 'user', content: text }], (acc) => {
                    full = acc;
                    setRoomMessages((prev) => prev.map((m) => (m.id === pid ? { ...m, text: acc } : m)));
                }, p.prompt);
                if (full) {
                    const saved = await api.postRoomMessage(activeRoom.id, { sender_name: p.name, content: full, role: 'bot', persona: p.name });
                    setRoomMessages((prev) => prev.map((m) => (m.id === pid ? { ...m, id: `room-${saved.id}` } : m)));
                    lastMsgIdRef.current = Math.max(lastMsgIdRef.current, saved.id);
                }
            } catch {
                setRoomMessages((prev) => prev.map((m) => (m.id === pid ? { ...m, text: `_${p.name} is unavailable right now._` } : m)));
            }
        }
        setIsGenerating(false);
    };

    const createRoom = async () => {
        if (!userId || !roomName.trim()) return;
        try {
            const room = await api.createRoom({ user_id: userId, name: roomName.trim().slice(0, 100) });
            setCreatedCode(room.invite_code);
            setRoomName('');
            loadRooms();
        } catch (err: any) { toast.error('Couldn’t create the room', { description: err?.message }); }
    };

    const joinRoom = async () => {
        if (!userId || !joinCode.trim()) return;
        try {
            await api.joinRoom({ user_id: userId, invite_code: joinCode.trim() });
            setJoinCode('');
            setRoomDialog(null);
            loadRooms();
            toast.success('Joined the room');
        } catch { toast.error('That invite code didn’t work'); }
    };

    const regenerateCode = async () => {
        if (!activeRoom) return;
        try {
            const updated = await api.regenerateInviteCode(activeRoom.id);
            setActiveRoom({ ...activeRoom, invite_code: updated.invite_code });
            toast.success('New invite code created', { description: 'The old code no longer works.' });
        } catch (err: any) { toast.error('Only the room’s creator can do that', { description: err?.message }); }
    };

    // ── composer ──
    const send = () => {
        const text = input.trim();
        if (!text || isGenerating) return;
        if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }
        setInput('');
        setMentionOpen(false);
        if (inRoom) sendRoom(text); else sendTutor(text);
    };

    const onInputChange = (val: string) => {
        setInput(val);
        if (!inRoom) return;
        const at = val.lastIndexOf('@');
        if (at >= 0 && !/\s/.test(val.slice(at + 1))) { setMentionOpen(true); setMentionFilter(val.slice(at + 1).toLowerCase()); }
        else setMentionOpen(false);
    };

    const insertMention = (name: string) => {
        const at = input.lastIndexOf('@');
        setInput(`${input.slice(0, at)}@${name} `);
        setMentionOpen(false);
        inputRef.current?.focus();
    };

    // deep links from the command palette / home
    useEffect(() => {
        const ask = params.get('ask');
        if (params.get('new')) { setParams({}, { replace: true }); newChat(); }
        else if (ask) { setParams({}, { replace: true }); setMode('tutor'); setActiveSession(null); setMessages([]); setInput(ask); setTimeout(() => inputRef.current?.focus(), 50); }
    }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredSessions = sessions.filter((s) => (s.title || s.first_message || '').toLowerCase().includes(sessionFilter.toLowerCase()));
    const mentionList = PERSONAS.filter((p) => !mentionFilter || p.name.toLowerCase().startsWith(mentionFilter));
    const lastIsBotStreaming = (m: Message, i: number) => isGenerating && i === shown.length - 1 && (m.role === 'assistant' || m.role === 'bot');

    // ── side panel ──
    const panel = (
        <div className="flex h-full flex-col">
            <div className="space-y-3 p-3">
                <Segmented<Mode>
                    value={mode}
                    onChange={(m) => { setMode(m); if (m === 'tutor') setActiveRoom(null); }}
                    className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
                    options={[{ value: 'tutor', label: 'Tutor', icon: <Bot /> }, { value: 'rooms', label: 'Rooms', icon: <Users /> }]}
                />
                {mode === 'tutor' ? (
                    <>
                        <Button variant="primary" className="w-full" icon={<MessageSquarePlus className="size-4" />} onClick={newChat}>New chat</Button>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                            <input value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} placeholder="Search chats" className="input h-9 pl-8 text-xs" />
                        </div>
                    </>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => { setCreatedCode(''); setRoomDialog('create'); }}>Create</Button>
                        <Button variant="secondary" size="sm" icon={<LogIn className="size-3.5" />} onClick={() => setRoomDialog('join')}>Join</Button>
                    </div>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {mode === 'tutor' ? (
                    loadingSessions ? (
                        <div className="space-y-1.5 px-1">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-9" />)}</div>
                    ) : filteredSessions.length === 0 ? (
                        <p className="px-3 py-8 text-center text-xs text-subtle">{sessions.length ? 'No matches' : 'Your conversations will show up here.'}</p>
                    ) : groupSessions(filteredSessions).map(([label, list]) => (
                        <div key={label} className="mb-3">
                            <div className="eyebrow px-2.5 py-1.5">{label}</div>
                            {list.map((s) => (
                                <div
                                    key={s.id}
                                    onClick={() => renaming?.id !== s.id && openSession(s)}
                                    className={cn(
                                        'group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition',
                                        activeSession?.id === s.id ? 'bg-brand-500/10 text-ink' : 'text-muted hover:bg-sunken hover:text-ink',
                                    )}
                                >
                                    {renaming?.id === s.id ? (
                                        <input
                                            autoFocus
                                            value={renaming.title}
                                            onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
                                            onBlur={saveRename}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null); }}
                                            className="h-6 flex-1 rounded border border-brand-500/50 bg-bg px-1.5 text-sm outline-none"
                                        />
                                    ) : (
                                        <span className="flex-1 truncate">{s.title && s.title !== 'New Chat' ? s.title : s.first_message || 'New chat'}</span>
                                    )}
                                    <div className="hidden items-center group-hover:flex">
                                        <button onClick={(e) => { e.stopPropagation(); setRenaming({ id: s.id, title: s.title !== 'New Chat' ? s.title : (s.first_message || '') }); }} className="rounded p-1 text-subtle hover:text-ink" title="Rename"><Pencil className="size-3" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); deleteSession(s); }} className="rounded p-1 text-subtle hover:text-red-500" title="Delete"><Trash2 className="size-3" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))
                ) : loadingRooms ? (
                    <div className="space-y-1.5 px-1">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
                ) : rooms.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-subtle">No rooms yet. Create one and share the invite code.</p>
                ) : rooms.map((r) => (
                    <button
                        key={r.id}
                        onClick={() => enterRoom(r)}
                        className={cn('mb-1 flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition', activeRoom?.id === r.id ? 'bg-brand-500/10' : 'hover:bg-sunken')}
                    >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-cyan-500 text-white"><Hash className="size-4" /></div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{r.name}</div>
                            <div className="truncate text-xs text-subtle">{r.last_message || `${r.member_count} member${r.member_count === 1 ? '' : 's'}`}</div>
                        </div>
                    </button>
                ))}
            </div>

            {mode === 'tutor' && sessions.length > 0 && (
                <div className="border-t border-line p-2">
                    <button onClick={clearAll} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-subtle transition hover:bg-red-500/10 hover:text-red-500">
                        <Trash2 className="size-3.5" /> Clear all conversations
                    </button>
                </div>
            )}
            {mode === 'rooms' && (
                <div className="border-t border-line p-3">
                    <div className="eyebrow mb-2">Summon a persona with @</div>
                    <div className="flex flex-wrap gap-1.5">
                        {PERSONAS.map((p) => (
                            <span key={p.name} className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken px-2 py-0.5 text-[11px]" title={p.tagline}>
                                {p.emoji} {p.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    const roomsLanding = mode === 'rooms' && !activeRoom;

    return (
        <div className="flex h-full">
            {confirmNode}
            {/* desktop panel */}
            <aside className="hidden w-72 shrink-0 border-r border-line bg-surface/50 backdrop-blur-xl md:block">{panel}</aside>

            {/* mobile drawer */}
            <AnimatePresence>
                {panelOpen && (
                    <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="absolute inset-0 bg-black/50" onClick={() => setPanelOpen(false)} />
                        <motion.div
                            className="absolute inset-y-0 left-0 w-[85%] max-w-xs border-r border-line bg-surface"
                            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                        >
                            {panel}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* main */}
            <div className="flex min-w-0 flex-1 flex-col">
                {/* header */}
                <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
                    <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setPanelOpen(true)}><PanelLeft className="size-4" /></Button>
                    {inRoom && activeRoom ? (
                        <>
                            <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" onClick={() => setActiveRoom(null)}><ArrowLeft className="size-4" /></Button>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 truncate text-sm font-semibold"><Hash className="size-4 text-subtle" />{activeRoom.name}</div>
                                <div className="flex items-center gap-1 text-[11px] text-subtle">
                                    {roomMembers.slice(0, 5).map((m) => <Avatar key={m.id} src={m.picture} name={m.name} size={14} />)}
                                    <span className="ml-1">{roomMembers.length} members</span>
                                </div>
                            </div>
                            <button
                                onClick={() => { navigator.clipboard?.writeText(activeRoom.invite_code); toast.success('Invite code copied'); }}
                                className="flex items-center gap-1.5 rounded-lg border border-line bg-sunken px-2.5 py-1 font-mono text-xs tracking-wider transition hover:border-line-strong"
                                title="Copy invite code"
                            >
                                <Copy className="size-3" /> {activeRoom.invite_code}
                            </button>
                            {activeRoom.created_by === userId && (
                                <Button variant="ghost" size="icon-sm" onClick={regenerateCode} title="New invite code"><RefreshCw className="size-3.5" /></Button>
                            )}
                        </>
                    ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
                            <span className="truncate text-sm font-semibold">
                                {mode === 'rooms' ? 'Study rooms' : activeSession ? (activeSession.title !== 'New Chat' ? activeSession.title : activeSession.first_message || 'Conversation') : 'New conversation'}
                            </span>
                        </div>
                    )}
                </div>

                {roomsLanding ? (
                    <div className="flex flex-1 items-center justify-center p-6">
                        <EmptyState
                            className="max-w-lg border-none"
                            icon={<Users />}
                            title="Study with friends — and famous minds"
                            description="Create a room, share its invite code, and type @Socrates, @Ada, @Newton or @Turing to bring an AI persona into the discussion."
                            action={<div className="flex gap-2">
                                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setCreatedCode(''); setRoomDialog('create'); }}>Create room</Button>
                                <Button variant="secondary" icon={<LogIn className="size-4" />} onClick={() => setRoomDialog('join')}>Join with code</Button>
                            </div>}
                        />
                    </div>
                ) : (
                    <>
                        {/* messages */}
                        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
                            <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
                                {loadingMessages ? (
                                    <div className="flex justify-center py-20"><Spinner className="size-6" /></div>
                                ) : shown.length === 0 ? (
                                    inRoom ? (
                                        <p className="py-20 text-center text-sm text-subtle">No messages yet — say hi, or ask @Socrates something.</p>
                                    ) : (
                                        <div className="flex flex-col items-center pt-10 text-center sm:pt-16">
                                            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4 }}>
                                                <LogoMark className="size-16" />
                                            </motion.div>
                                            <h2 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">How can I help you learn today?</h2>
                                            <p className="mt-2 max-w-md text-sm text-muted">Ask anything — I remember this conversation and can search the web for fresh facts.</p>
                                            <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                                                {SUGGESTIONS.map((s, i) => (
                                                    <motion.button
                                                        key={s.title}
                                                        initial={{ opacity: 0, y: 8 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: 0.1 + i * 0.05 }}
                                                        onClick={() => { setInput(s.body); inputRef.current?.focus(); }}
                                                        className="card card-hover p-4 text-left"
                                                    >
                                                        <div className="text-sm font-medium">{s.title}</div>
                                                        <div className="mt-0.5 text-sm text-subtle">{s.body}</div>
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="space-y-6">
                                        {shown.map((m, i) => {
                                            if (m.role === 'system') {
                                                return (
                                                    <div key={m.id} className="flex justify-center">
                                                        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                                                            {m.text}
                                                            {!inRoom && i === shown.length - 1 && <button onClick={retryLast} className="font-semibold underline">Retry</button>}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            const mine = inRoom ? m.role === 'user' && String(m.senderId) === String(userId) : m.role === 'user';
                                            const isBot = m.role === 'assistant' || m.role === 'bot';
                                            const persona = personaOf(m.persona);
                                            const streaming = lastIsBotStreaming(m, i) || (isGenerating && isBot && !m.text);

                                            if (mine) {
                                                return (
                                                    <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                                                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-lg shadow-brand-500/20">
                                                            {m.text}
                                                        </div>
                                                    </motion.div>
                                                );
                                            }

                                            return (
                                                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group flex gap-3">
                                                    <div className="shrink-0 pt-0.5">
                                                        {persona ? (
                                                            <div className={cn('flex size-8 items-center justify-center rounded-lg bg-gradient-to-br text-base', persona.color)}>{persona.emoji}</div>
                                                        ) : isBot ? (
                                                            <LogoMark className="size-8" />
                                                        ) : (
                                                            <Avatar name={m.senderName} size={32} />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-1 flex items-center gap-2 text-xs">
                                                            <span className={cn('font-semibold', persona?.text)}>{persona ? persona.name : isBot ? 'Cognify' : m.senderName}</span>
                                                            {m.createdAt && <span className="text-subtle">{timeAgo(m.createdAt)}</span>}
                                                        </div>
                                                        {!m.text && streaming ? (
                                                            <div className="flex items-center gap-2 py-1 text-sm text-subtle">
                                                                {isSearching && !inRoom ? <><Globe className="size-4 animate-pulse text-cyan-500" /> Searching the web…</> : (
                                                                    <span className="flex gap-1">
                                                                        {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: `${d * 140}ms` }} />)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : isBot ? (
                                                            <Markdown streaming={streaming} className="!text-[15px]">{m.text}</Markdown>
                                                        ) : (
                                                            <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">{m.text}</div>
                                                        )}
                                                        {isBot && m.text && !streaming && (
                                                            <div className="mt-1.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                                                                <button onClick={() => copyMessage(m.id, m.text)} className="rounded-md p-1.5 text-subtle hover:bg-sunken hover:text-ink" title="Copy">
                                                                    {copiedId === m.id ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                                                                </button>
                                                                <button onClick={() => toggleSpeak(m.id, m.text)} className="rounded-md p-1.5 text-subtle hover:bg-sunken hover:text-ink" title={speakingId === m.id ? 'Stop' : 'Read aloud'}>
                                                                    {speakingId === m.id ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                                                                </button>
                                                                {!inRoom && i === shown.length - 1 && (
                                                                    <button onClick={retryLast} className="rounded-md p-1.5 text-subtle hover:bg-sunken hover:text-ink" title="Regenerate"><RefreshCw className="size-3.5" /></button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* composer */}
                        <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
                            <div className="relative mx-auto max-w-3xl">
                                <AnimatePresence>
                                    {mentionOpen && mentionList.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                                            className="card absolute bottom-full left-0 mb-2 w-64 bg-elevated p-1.5"
                                        >
                                            {mentionList.map((p) => (
                                                <button key={p.name} onClick={() => insertMention(p.name)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sunken">
                                                    <span className={cn('flex size-7 items-center justify-center rounded-lg bg-gradient-to-br', p.color)}>{p.emoji}</span>
                                                    <div>
                                                        <div className="text-sm font-medium">@{p.name}</div>
                                                        <div className="text-[11px] text-subtle">{p.tagline}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div className={cn(
                                    'flex items-end gap-2 rounded-2xl border bg-surface/90 p-2 shadow-[var(--shadow-card)] backdrop-blur-xl transition focus-within:border-brand-500/50 focus-within:ring-4 focus-within:ring-brand-500/10',
                                    isListening ? 'border-red-500/50' : 'border-line',
                                )}>
                                    <button
                                        onClick={toggleListening}
                                        className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl transition', isListening ? 'mic-recording bg-red-500 text-white' : 'text-subtle hover:bg-sunken hover:text-ink')}
                                        title={isListening ? 'Stop listening' : 'Voice input'}
                                    >
                                        {isListening ? <Square className="size-3.5" fill="currentColor" /> : <Mic className="size-[18px]" />}
                                    </button>
                                    <textarea
                                        ref={inputRef}
                                        rows={1}
                                        value={input}
                                        onChange={(e) => onInputChange(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                                        placeholder={isListening ? 'Listening…' : inRoom ? 'Message the room — type @ to summon a persona' : 'Ask anything…'}
                                        className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-subtle"
                                    />
                                    <button
                                        onClick={send}
                                        disabled={!input.trim() || isGenerating}
                                        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/30 transition disabled:from-sunken disabled:to-sunken disabled:text-subtle disabled:shadow-none"
                                        title="Send"
                                    >
                                        {isGenerating ? <Spinner className="size-4 text-current" /> : <ArrowUp className="size-[18px]" />}
                                    </button>
                                </div>
                                <p className="mt-2 text-center text-[11px] text-subtle">
                                    {inRoom ? 'Room messages are visible to every member.' : 'Enter to send · Shift + Enter for a new line · AI can make mistakes.'}
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* room dialogs */}
            <Modal open={roomDialog === 'create'} onClose={() => setRoomDialog(null)} title="Create a study room" description="Give it a name, then share the invite code with friends.">
                {createdCode ? (
                    <div className="text-center">
                        <Badge tone="success" icon={<Check className="size-3" />}>Room created</Badge>
                        <button
                            onClick={() => { navigator.clipboard?.writeText(createdCode); toast.success('Invite code copied'); }}
                            className="mx-auto mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/5 px-6 py-4 font-mono text-3xl font-semibold tracking-[0.3em] text-brand-600 dark:text-brand-300"
                        >
                            {createdCode} <Copy className="size-5 opacity-60" />
                        </button>
                        <Button className="mt-6" variant="primary" onClick={() => { setRoomDialog(null); setMode('rooms'); }}>Done</Button>
                    </div>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); createRoom(); }} className="flex gap-2">
                        <input autoFocus value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. ML study group" className="input" maxLength={100} />
                        <Button type="submit" variant="primary" disabled={!roomName.trim()}>Create</Button>
                    </form>
                )}
            </Modal>
            <Modal open={roomDialog === 'join'} onClose={() => setRoomDialog(null)} title="Join a room" description="Paste the 8-character invite code you were given.">
                <form onSubmit={(e) => { e.preventDefault(); joinRoom(); }} className="flex gap-2">
                    <input
                        autoFocus value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={8}
                        placeholder="A1B2C3D4" className="input text-center font-mono text-lg tracking-[0.3em]"
                    />
                    <Button type="submit" variant="primary" disabled={!joinCode.trim()}>Join</Button>
                </form>
            </Modal>
        </div>
    );
};

export default ChatbotView;
