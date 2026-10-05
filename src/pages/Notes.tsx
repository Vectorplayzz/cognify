import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
    ArrowLeft, Check, ClipboardList, Copy, FileText, GraduationCap, Layers3, MessageSquareText, NotebookPen, Plus, Presentation,
    Printer, RotateCw, Sparkles, Trash2, Type, UploadCloud, X,
} from 'lucide-react';
import { notesService, NoteSource } from '../services/notesService';
import { aiService } from '../services/llamaService';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';
import { Badge, Button, Modal, Segmented, Spinner } from '../ui';
import { useConfirm } from '../ui/useConfirm';
import Markdown from '../ui/Markdown';
import { BotMessage, Composer, UserBubble, useSpeaker } from '../ui/chat';

type NoteType = 'summary' | 'study_guide' | 'exam_prep' | 'flashcards';
const TYPES: { value: NoteType; label: string; body: string; icon: React.ComponentType<any>; tint: string }[] = [
    { value: 'summary', label: 'Summary', body: 'The key ideas, condensed', icon: FileText, tint: 'bg-brand-500/12 text-brand-600 dark:text-brand-300' },
    { value: 'study_guide', label: 'Study guide', body: 'Topics, terms, examples', icon: GraduationCap, tint: 'bg-sky-500/12 text-sky-600 dark:text-sky-300' },
    { value: 'exam_prep', label: 'Exam prep', body: 'Facts + practice Qs', icon: ClipboardList, tint: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
    { value: 'flashcards', label: 'Flashcards', body: 'Flip-to-reveal cards', icon: Layers3, tint: 'bg-pink-500/12 text-pink-600 dark:text-pink-300' },
];
const meta = (t: string) => TYPES.find((x) => x.value === t) || TYPES[0];
const SOURCE_BUDGET = 60_000;

interface NoteRow { id: number; title: string; type: NoteType; content: string; created_at?: string; updated_at?: string; sources?: any[]; }
interface Q { id: string; role: 'user' | 'assistant'; text: string; }

function parseFlashcards(content: string) {
    const cards: { q: string; a: string }[] = [];
    for (const raw of content.split('\n')) {
        const m = raw.replace(/^[-*\d.\s]+/, '').trim().match(/^\**Q:?\**\s*(.+?)\s*\|\s*\**A:?\**\s*(.+)$/i);
        if (m) cards.push({ q: m[1].trim(), a: m[2].trim() });
    }
    return cards;
}

const Flashcards: React.FC<{ cards: { q: string; a: string }[] }> = ({ cards }) => {
    const [i, setI] = useState(0);
    const [flip, setFlip] = useState(false);
    const c = cards[i];
    const go = (d: number) => { setFlip(false); setTimeout(() => setI((x) => (x + d + cards.length) % cards.length), 120); };
    return (
        <div className="mx-auto max-w-xl">
            <div className="mb-3 flex items-center justify-between text-sm font-bold text-subtle"><span>Card {i + 1} of {cards.length}</span><span>Tap to flip</span></div>
            <button className="flip-card block h-72 w-full text-left" data-flipped={flip} onClick={() => setFlip((f) => !f)}>
                <div className="flip-inner relative h-full w-full">
                    <div className="flip-face panel absolute inset-0 flex flex-col items-center justify-center p-8 text-center shadow-[0_5px_0_0_var(--c-line)]">
                        <span className="eyebrow">Question</span>
                        <p className="mt-4 font-display text-2xl font-bold leading-snug">{c.q}</p>
                    </div>
                    <div className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-brand-500 p-8 text-center text-white shadow-[0_5px_0_0_var(--color-brand-700)]">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">Answer</span>
                        <p className="mt-4 text-lg font-semibold leading-relaxed">{c.a}</p>
                    </div>
                </div>
            </button>
            <div className="mt-6 flex items-center justify-center gap-3">
                <Button onClick={() => go(-1)}>Previous</Button>
                <Button variant="soft" size="icon" onClick={() => setFlip((f) => !f)} title="Flip"><RotateCw className="size-4" /></Button>
                <Button variant="primary" onClick={() => go(1)}>Next</Button>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-1.5">
                {cards.map((_, k) => <button key={k} onClick={() => { setFlip(false); setI(k); }} className={cn('h-2 rounded-full transition-all', k === i ? 'w-6 bg-brand-500' : 'w-2 bg-line-strong')} />)}
            </div>
        </div>
    );
};

const Notes: React.FC = () => {
    const userId = progressService.getDbUserId();
    const [sources, setSources] = useState<api.SourceSummary[] | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const contentCache = useRef(new Map<number, string>());
    const [notes, setNotes] = useState<NoteRow[] | null>(null);
    const [viewing, setViewing] = useState<NoteRow | null>(null);
    const [generating, setGenerating] = useState<{ type: NoteType; text: string } | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [pasteTitle, setPasteTitle] = useState('');
    const [pasteText, setPasteText] = useState('');
    const [chat, setChat] = useState<Q[]>([]);
    const [input, setInput] = useState('');
    const [asking, setAsking] = useState(false);
    const [mobileTab, setMobileTab] = useState<'sources' | 'chat' | 'studio'>('chat');
    const [view, setView] = useState<'cards' | 'text'>('cards');
    const [confirmNode, confirm] = useConfirm();
    const speaker = useSpeaker();
    const fileRef = useRef<HTMLInputElement>(null);
    const printRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const loadSources = useCallback(async () => {
        try { const s = await api.getMySources(); setSources(s); return s; } catch { setSources([]); return []; }
    }, []);
    useEffect(() => {
        loadSources().then((s) => setSelected(new Set(s.slice(0, 5).map((x) => x.id))));
        if (userId) api.getUserNotes(userId).then(setNotes).catch(() => setNotes([])); else setNotes([]);
    }, [loadSources, userId]);
    useLayoutEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [chat]);

    const selectedList = (sources || []).filter((s) => selected.has(s.id));

    const fullSources = async (): Promise<NoteSource[]> => {
        const out: NoteSource[] = [];
        for (const s of selectedList) {
            if (!contentCache.current.has(s.id)) {
                const full = await api.getSource(s.id);
                contentCache.current.set(s.id, full.content || '');
            }
            out.push({ id: s.id, noteId: 0, type: 'text', title: s.title, content: contentCache.current.get(s.id) || '', metadata: {} });
        }
        const total = out.reduce((a, s) => a + s.content.length, 0);
        if (total > SOURCE_BUDGET) { const r = SOURCE_BUDGET / total; out.forEach((s) => { s.content = s.content.slice(0, Math.floor(s.content.length * r)); }); }
        return out;
    };

    const addSource = async (title: string, content: string) => {
        const src = await api.createNoteSource({ noteId: null, type: 'text', title, content, userId: userId ?? null });
        contentCache.current.set(src.id, content);
        setSources((p) => [{ id: src.id, type: src.type, title: src.title, length: content.length, preview: content.slice(0, 240), created_at: src.created_at }, ...(p || [])]);
        setSelected((p) => new Set([...p, src.id]));
    };

    const handleFiles = async (files: FileList | File[]) => {
        const list = Array.from(files).filter((f) => /\.(pdf|txt|md)$/i.test(f.name));
        if (!list.length) { toast.error('Only PDF, TXT and Markdown files are supported'); return; }
        const big = list.find((f) => f.size > 10 * 1024 * 1024);
        if (big) { toast.error(`${big.name} is larger than 10 MB`); return; }
        setUploading(true);
        try {
            const form = new FormData();
            list.slice(0, 5).forEach((f) => form.append('files', f));
            const res = await fetch('/api/notes/upload-files', { method: 'POST', headers: api.authHeaders(), body: form });
            api.handleUnauthorized(res);
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) throw new Error(data?.error || `Upload failed (HTTP ${res.status})`);
            for (const f of data.files || []) await addSource(f.filename, f.content);
            if (data.skipped?.length) toast.warning(`Couldn’t read: ${data.skipped.join(', ')}`);
            toast.success(`Added ${(data.files || []).length} source${data.files?.length === 1 ? '' : 's'}`);
            setAddOpen(false);
        } catch (err: any) { toast.error('Upload failed', { description: err?.message }); }
        finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
    };

    const addPasted = async () => {
        if (!pasteText.trim()) return;
        try { await addSource(pasteTitle.trim() || `Pasted text ${(sources?.length || 0) + 1}`, pasteText.trim()); setPasteText(''); setPasteTitle(''); setAddOpen(false); }
        catch (err: any) { toast.error('Couldn’t add that source', { description: err?.message }); }
    };

    const removeSource = async (s: api.SourceSummary) => {
        if (!(await confirm({ title: 'Remove this source?', description: `“${s.title}” will be deleted and no longer used for answers.`, confirmLabel: 'Remove', danger: true }))) return;
        try { await api.deleteSource(s.id); setSources((p) => (p || []).filter((x) => x.id !== s.id)); setSelected((p) => { const n = new Set(p); n.delete(s.id); return n; }); }
        catch (err: any) { toast.error('Couldn’t remove it', { description: err?.message }); }
    };

    const generate = async (type: NoteType) => {
        if (!userId || !selectedList.length || generating) return;
        setGenerating({ type, text: '' }); setViewing(null); setMobileTab('chat');
        try {
            const srcs = await fullSources();
            let content = '';
            await notesService.generateNotesStream({ sources: srcs, noteType: type, useRAG: true }, (c) => { content = c; setGenerating({ type, text: c }); });
            const h = content.match(/^#\s+(.+)$/m)?.[1]?.replace(/^(Summary|Study Guide|Exam Prep|Flashcards)\s*:\s*/i, '').trim();
            const title = `${h || selectedList[0].title.replace(/\.(pdf|txt|md)$/i, '')} · ${meta(type).label}`.slice(0, 250);
            const created = await api.createNote({ userId, title, type, content, sourceIds: selectedList.map((s) => s.id) });
            const full = await api.getNote(created.id);
            setNotes((p) => [full, ...(p || [])]);
            setViewing(full);
            toast.success(`${meta(type).label} ready`);
        } catch (err: any) { toast.error('Couldn’t generate', { description: err?.message }); }
        finally { setGenerating(null); }
    };

    const ask = async (qArg?: string) => {
        const question = (qArg ?? input).trim();
        if (!question || asking) return;
        if (!selectedList.length) { toast.error('Select at least one source first'); return; }
        setInput(''); setAsking(true); setViewing(null);
        const u: Q = { id: `u${Date.now()}`, role: 'user', text: question };
        const a: Q = { id: `a${Date.now()}`, role: 'assistant', text: '' };
        const prior = chat.slice(-8);
        setChat((p) => [...p, u, a]);
        try {
            const ids = new Set(selectedList.map((s) => s.id));
            let excerpts = '';
            try {
                const res = await fetch('/api/notes/retrieve', { method: 'POST', headers: api.authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ query: question, topK: 12 }) });
                const data = await res.json();
                const hits = (data.results || []).filter((r: any) => ids.has(Number(r.metadata?.sourceId)));
                excerpts = hits.slice(0, 6).map((r: any) => `[${r.metadata?.title || 'Source'}]\n${r.content}`).join('\n\n---\n\n');
            } catch { /* fall back to full text */ }
            if (!excerpts) {
                const srcs = await fullSources();
                excerpts = srcs.map((s) => `[${s.title}]\n${s.content.slice(0, Math.floor(16000 / srcs.length))}`).join('\n\n---\n\n');
            }
            const system = `You answer questions using ONLY the learner's sources below. If the answer is not in them, say so plainly. Cite the source title in square brackets after each claim, like [Lecture 3.pdf]. Use markdown.\n\nSOURCES:\n${excerpts}`;
            await aiService.chatStream([...prior.map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: question }],
                (acc) => setChat((p) => p.map((m) => (m.id === a.id ? { ...m, text: acc } : m))), system);
        } catch (err: any) {
            setChat((p) => p.map((m) => (m.id === a.id ? { ...m, text: `**Couldn’t answer right now.** ${err?.message || ''}` } : m)));
        } finally { setAsking(false); }
    };

    const removeNote = async (n: NoteRow) => {
        if (!(await confirm({ title: 'Delete these notes?', description: `“${n.title}” will be permanently removed.`, confirmLabel: 'Delete', danger: true }))) return;
        try { await api.deleteNote(n.id); setNotes((p) => (p || []).filter((x) => x.id !== n.id)); if (viewing?.id === n.id) setViewing(null); await loadSources(); }
        catch (err: any) { toast.error('Delete failed', { description: err?.message }); }
    };

    const exportPdf = () => {
        if (!viewing || !printRef.current) return;
        const w = window.open('', '_blank');
        if (!w) { toast.error('Allow pop-ups to export'); return; }
        const d = w.document;
        d.open();
        d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;padding:40px;line-height:1.65;color:#1b1a2e;max-width:820px;margin:0 auto}h1{color:#5a41f0}h2{margin-top:28px}code{background:#f1efff;padding:2px 6px;border-radius:4px}pre{background:#f6f5f1;padding:14px;border-radius:8px;overflow:auto}.not-prose button{display:none}</style></head><body></body></html>');
        d.close(); d.title = viewing.title;
        const h = d.createElement('h1'); h.textContent = viewing.title; d.body.appendChild(h);
        d.body.appendChild(d.importNode(printRef.current, true));
        setTimeout(() => w.print(), 250);
    };

    const exportPptx = async () => {
        if (!viewing) return;
        const id = toast.loading('Building slides…');
        try {
            const { default: Pptx } = await import('pptxgenjs');
            const p = new Pptx(); p.layout = 'LAYOUT_WIDE';
            const t = p.addSlide(); t.background = { color: '5A41F0' };
            t.addText(viewing.title, { x: 0.6, y: 2.3, w: 12, h: 1.4, fontSize: 40, bold: true, color: 'FFFFFF' });
            t.addText(`${meta(viewing.type).label} · Cognify`, { x: 0.6, y: 3.8, w: 12, h: 0.6, fontSize: 18, color: 'E4E0FF' });
            const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/^\s*[-*+]\s+/, '').trim();
            const cards = viewing.type === 'flashcards' ? parseFlashcards(viewing.content) : [];
            const sections = cards.length ? cards.map((c, i) => ({ heading: `Q${i + 1}. ${c.q}`, bullets: [c.a] }))
                : viewing.content.split(/\n(?=##\s)/).map((b) => {
                    const lines = b.split('\n').filter((l) => l.trim() && !/^#\s/.test(l));
                    return { heading: clean((lines.find((l) => /^#{2,3}\s/.test(l)) || '').replace(/^#+\s*/, '')) || viewing.title, bullets: lines.filter((l) => !/^#{2,3}\s/.test(l)).map(clean).filter(Boolean) };
                }).filter((s) => s.bullets.length);
            for (const s of sections) for (let i = 0; i < s.bullets.length; i += 7) {
                const sl = p.addSlide();
                sl.addShape('rect' as any, { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: '6C56FF' } });
                sl.addText(s.heading + (i ? ' (cont.)' : ''), { x: 0.6, y: 0.4, w: 12, h: 0.9, fontSize: 26, bold: true, color: '1B1A2E' });
                sl.addText(s.bullets.slice(i, i + 7).map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.4, w: 12, h: 5.6, fontSize: 16, color: '5B596F', valign: 'top', paraSpaceAfter: 8 });
            }
            await p.writeFile({ fileName: `${viewing.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 60) || 'notes'}.pptx` });
            toast.success('Slides downloaded', { id });
        } catch (err: any) { toast.error('Export failed', { id, description: err?.message }); }
    };

    const shownContent = generating ? generating.text : viewing?.content || '';
    const shownType = generating ? generating.type : viewing?.type;
    const cards = useMemo(() => (shownType === 'flashcards' ? parseFlashcards(shownContent) : []), [shownType, shownContent]);

    // ── panels ──
    const sourcesPanel = (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between p-4 pb-2">
                <h2 className="text-lg font-bold">Sources</h2>
                <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>Add</Button>
            </div>
            {sources && sources.length > 0 && (
                <button onClick={() => setSelected(selected.size === sources.length ? new Set() : new Set(sources.map((s) => s.id)))} className="mx-4 mb-2 flex items-center justify-between rounded-lg px-1 text-xs font-bold text-subtle hover:text-muted">
                    <span>{selected.size} of {sources.length} selected</span><span>{selected.size === sources.length ? 'Clear' : 'Select all'}</span>
                </button>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {sources === null ? [0, 1, 2].map((i) => <div key={i} className="skeleton mx-2 mb-2 h-14" />)
                    : sources.length === 0 ? (
                        <button onClick={() => setAddOpen(true)} className="m-2 flex w-[calc(100%-1rem)] flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong p-6 text-center hover:border-brand-400">
                            <UploadCloud className="size-8 text-brand-500" />
                            <span className="font-bold">Add your first source</span>
                            <span className="text-xs text-muted">PDFs, notes, articles, transcripts</span>
                        </button>
                    ) : sources.map((s) => {
                        const on = selected.has(s.id);
                        return (
                            <div key={s.id} onClick={() => setSelected((p) => { const n = new Set(p); on ? n.delete(s.id) : n.add(s.id); return n; })}
                                className={cn('group mb-1 flex cursor-pointer items-start gap-3 rounded-xl p-2.5', on ? 'bg-brand-500/8' : 'hover:bg-sunken')}>
                                <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line-strong')}>{on && <Check className="size-3" strokeWidth={4} />}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-bold">{s.title}</div>
                                    <div className="text-[11px] text-subtle">{Number(s.length).toLocaleString()} chars · {timeAgo(s.created_at)}</div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); removeSource(s); }} className="hidden rounded p-1 text-subtle hover:text-red-500 group-hover:block"><X className="size-4" /></button>
                            </div>
                        );
                    })}
            </div>
        </div>
    );

    const studioPanel = (
        <div className="flex h-full flex-col">
            <div className="p-4 pb-2"><h2 className="text-lg font-bold">Studio</h2><p className="text-xs text-muted">Create study material from the selected sources.</p></div>
            <div className="grid grid-cols-2 gap-2 px-4">
                {TYPES.map((t) => (
                    <button key={t.value} disabled={!selectedList.length || !!generating} onClick={() => generate(t.value)}
                        className="panel panel-press flex flex-col items-start gap-2 p-3 text-left disabled:cursor-not-allowed disabled:opacity-50">
                        <span className={cn('flex size-9 items-center justify-center rounded-xl', t.tint)}>{generating?.type === t.value ? <Spinner className="size-4 text-current" /> : <t.icon className="size-5" />}</span>
                        <div><div className="text-sm font-bold">{t.label}</div><div className="text-[11px] leading-tight text-subtle">{t.body}</div></div>
                    </button>
                ))}
            </div>
            <div className="eyebrow mt-6 px-4 pb-2">Saved notes</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {notes === null ? [0, 1].map((i) => <div key={i} className="skeleton mx-2 mb-2 h-12" />)
                    : notes.length === 0 ? <p className="px-4 py-4 text-sm text-subtle">Nothing yet — pick a format above.</p>
                        : notes.map((n) => {
                            const m = meta(n.type);
                            return (
                                <div key={n.id} onClick={() => { setViewing(n); setMobileTab('chat'); api.getNote(n.id).then(setViewing).catch(() => {}); }}
                                    className={cn('group mb-1 flex cursor-pointer items-center gap-3 rounded-xl p-2.5', viewing?.id === n.id ? 'bg-sunken' : 'hover:bg-sunken/70')}>
                                    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', m.tint)}><m.icon className="size-4" /></span>
                                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{n.title}</div><div className="text-[11px] text-subtle">{m.label} · {timeAgo(n.updated_at || n.created_at || Date.now())}</div></div>
                                    <button onClick={(e) => { e.stopPropagation(); removeNote(n); }} className="hidden rounded p-1 text-subtle hover:text-red-500 group-hover:block"><Trash2 className="size-3.5" /></button>
                                </div>
                            );
                        })}
            </div>
        </div>
    );

    const center = (generating || viewing) ? (
        <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b-2 border-line px-4 py-3">
                <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => setViewing(null)} disabled={!!generating}>Chat</Button>
                <div className="min-w-0 flex-1"><div className="truncate font-bold">{viewing?.title || `Writing your ${meta(shownType!).label.toLowerCase()}…`}</div></div>
                {viewing && !generating && (
                    <div className="flex gap-1">
                        {cards.length > 0 && <Segmented<'cards' | 'text'> size="sm" value={view} onChange={setView} options={[{ value: 'cards', label: 'Cards' }, { value: 'text', label: 'Text' }]} />}
                        <Button variant="ghost" size="icon-sm" title="Copy" onClick={() => { navigator.clipboard?.writeText(viewing.content); toast.success('Copied'); }}><Copy className="size-4" /></Button>
                        <Button variant="ghost" size="icon-sm" title="Print / PDF" onClick={exportPdf}><Printer className="size-4" /></Button>
                        <Button variant="ghost" size="icon-sm" title="Download slides" onClick={exportPptx}><Presentation className="size-4" /></Button>
                    </div>
                )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-10">
                {cards.length > 0 && view === 'cards' && !generating ? <Flashcards cards={cards} /> : shownContent ? (
                    <div ref={printRef} className="mx-auto max-w-2xl"><Markdown streaming={!!generating}>{shownContent}</Markdown></div>
                ) : <div className="mx-auto max-w-2xl space-y-3"><div className="skeleton h-8 w-1/2" /><div className="skeleton h-4" /><div className="skeleton h-4 w-5/6" /></div>}
                {cards.length > 0 && view === 'cards' && !generating && <div ref={printRef} className="hidden"><Markdown>{shownContent}</Markdown></div>}
            </div>
        </div>
    ) : (
        <div className="flex h-full flex-col">
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                {chat.length === 0 ? (
                    <div className="mx-auto flex max-w-xl flex-col items-center px-6 pt-[8vh] text-center">
                        <div className="flex size-16 items-center justify-center rounded-3xl bg-brand-500 text-white shadow-[0_5px_0_0_var(--color-brand-700)]"><MessageSquareText className="size-8" /></div>
                        <h1 className="mt-6 text-3xl font-extrabold">Chat with your sources</h1>
                        <p className="mt-2 text-muted">{selectedList.length ? `Answers come only from the ${selectedList.length} selected source${selectedList.length === 1 ? '' : 's'}, with citations.` : 'Add or select sources on the left to begin.'}</p>
                        {selectedList.length > 0 && (
                            <div className="mt-8 flex flex-wrap justify-center gap-2">
                                {['Summarize the main ideas', 'What terms should I know?', 'What might be on an exam?', 'Explain the hardest part simply'].map((s) => (
                                    <button key={s} onClick={() => ask(s)} className="rounded-full border-2 border-line bg-surface px-4 py-2 text-sm font-bold text-muted hover:border-brand-300 hover:text-brand-600">{s}</button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
                        {chat.map((m, i) => m.role === 'user' ? <UserBubble key={m.id} text={m.text} />
                            : <BotMessage key={m.id} id={m.id} text={m.text} name="Your sources" avatar={<span className="flex size-8 items-center justify-center rounded-xl bg-brand-500 text-white"><NotebookPen className="size-4" /></span>} speaker={speaker} streaming={asking && i === chat.length - 1} />)}
                    </div>
                )}
            </div>
            <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
                <Composer value={input} onChange={setInput} onSend={() => ask()} busy={asking}
                    placeholder={selectedList.length ? `Ask about ${selectedList.length} source${selectedList.length === 1 ? '' : 's'}…` : 'Select sources to start asking…'}
                    footer={chat.length > 0 ? <button onClick={() => setChat([])} className="font-bold hover:text-muted">Clear conversation</button> : 'Answers use only your selected sources'} />
            </div>
        </div>
    );

    return (
        <div className="flex h-full flex-col">
            {confirmNode}
            <div className="flex shrink-0 justify-center border-b-2 border-line p-2 lg:hidden">
                <Segmented<'sources' | 'chat' | 'studio'> value={mobileTab} onChange={setMobileTab}
                    options={[{ value: 'sources', label: `Sources${selected.size ? ` (${selected.size})` : ''}` }, { value: 'chat', label: viewing || generating ? 'Note' : 'Chat' }, { value: 'studio', label: 'Studio' }]} />
            </div>
            <div className="flex min-h-0 flex-1">
                <aside className={cn('w-full shrink-0 border-r-2 border-line bg-surface lg:block lg:w-80', mobileTab === 'sources' ? 'block' : 'hidden')}>{sourcesPanel}</aside>
                <section className={cn('min-w-0 flex-1 lg:block', mobileTab === 'chat' ? 'block' : 'hidden')}>{center}</section>
                <aside className={cn('w-full shrink-0 border-l-2 border-line bg-surface lg:block lg:w-80', mobileTab === 'studio' ? 'block' : 'hidden')}>{studioPanel}</aside>
            </div>

            <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add sources" description="Upload files or paste text. Sources stay private to you.">
                <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                    onClick={() => !uploading && fileRef.current?.click()}
                    className={cn('flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition', dragging ? 'border-brand-500 bg-brand-500/10' : 'border-line-strong hover:border-brand-400')}>
                    {uploading ? <Spinner className="size-8" /> : <UploadCloud className="size-9 text-brand-500" />}
                    <p className="mt-3 font-bold">{uploading ? 'Reading your files…' : 'Drop files or click to browse'}</p>
                    <p className="text-xs text-subtle">PDF, TXT, MD · up to 5 files · 10 MB each</p>
                    <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md" hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                </div>
                <div className="my-4 flex items-center gap-3 text-xs font-bold text-subtle"><div className="h-0.5 flex-1 bg-line" />OR PASTE TEXT<div className="h-0.5 flex-1 bg-line" /></div>
                <div className="space-y-2">
                    <input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Title (optional)" className="input" />
                    <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={5} placeholder="Lecture notes, an article, a transcript…" className="input resize-y" />
                    <Button variant="primary" className="w-full" icon={<Type className="size-4" />} disabled={!pasteText.trim()} onClick={addPasted}>Add text source</Button>
                </div>
            </Modal>
        </div>
    );
};

export default Notes;
