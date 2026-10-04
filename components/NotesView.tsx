import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
    ArrowLeft, BookOpenCheck, Check, ClipboardList, Copy, FileText, FileUp, GraduationCap, Layers3,
    NotebookPen, PanelLeft, Plus, Presentation, Printer, RotateCw, Sparkles, Trash2, Type, UploadCloud, X,
} from 'lucide-react';
import { notesService, NoteSource } from '../services/notesService';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';
import { Badge, Button, EmptyState, Spinner } from './ui';
import { useConfirm } from './ui/useConfirm';
import Markdown from './ui/Markdown';

type NoteType = 'summary' | 'study_guide' | 'exam_prep' | 'flashcards';

const NOTE_TYPES: { value: NoteType; label: string; body: string; icon: React.ComponentType<{ className?: string }>; gradient: string }[] = [
    { value: 'summary', label: 'Summary', body: 'Key ideas, condensed', icon: FileText, gradient: 'from-brand-500 to-indigo-500' },
    { value: 'study_guide', label: 'Study guide', body: 'Topics, definitions, examples', icon: GraduationCap, gradient: 'from-cyan-500 to-sky-600' },
    { value: 'exam_prep', label: 'Exam prep', body: 'Facts + practice questions', icon: ClipboardList, gradient: 'from-amber-500 to-orange-600' },
    { value: 'flashcards', label: 'Flashcards', body: 'Flip-able Q&A cards', icon: Layers3, gradient: 'from-pink-500 to-rose-600' },
];
const typeMeta = (t: string) => NOTE_TYPES.find((n) => n.value === t) || NOTE_TYPES[0];

// The LLM proxy caps a request at ~128 KB; keep the sources well inside it.
const SOURCE_BUDGET = 60_000;

interface NoteRow { id: number; title: string; type: NoteType; content: string; created_at?: string; updated_at?: string; source_count?: number; sources?: any[]; }

function parseFlashcards(content: string) {
    const cards: { q: string; a: string }[] = [];
    for (const raw of content.split('\n')) {
        const line = raw.replace(/^[-*\d.\s]+/, '').trim();
        const m = line.match(/^\**Q:?\**\s*(.+?)\s*\|\s*\**A:?\**\s*(.+)$/i);
        if (m) cards.push({ q: m[1].trim(), a: m[2].trim() });
    }
    return cards;
}

function noteTitle(content: string, type: NoteType, sources: NoteSource[]): string {
    const h = content.match(/^#\s+(.+)$/m)?.[1]?.replace(/^(Summary|Study Guide|Exam Prep|Flashcards)\s*:\s*/i, '').trim();
    const base = h || sources[0]?.title?.replace(/\.(pdf|txt|md)$/i, '') || 'Untitled';
    return `${base} · ${typeMeta(type).label}`.slice(0, 250);
}

const Flashcards: React.FC<{ cards: { q: string; a: string }[] }> = ({ cards }) => {
    const [flipped, setFlipped] = useState<Set<number>>(new Set());
    const toggle = (i: number) => setFlipped((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
    return (
        <div>
            <div className="mb-4 flex items-center justify-between text-sm text-muted">
                <span>{cards.length} cards · click a card to flip it</span>
                <Button variant="ghost" size="sm" icon={<RotateCw className="size-3.5" />} onClick={() => setFlipped(flipped.size ? new Set() : new Set(cards.map((_, i) => i)))}>
                    {flipped.size ? 'Reset all' : 'Flip all'}
                </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((c, i) => (
                    <button key={i} className="flip-card h-48 text-left" data-flipped={flipped.has(i)} onClick={() => toggle(i)}>
                        <div className="flip-inner relative h-full w-full">
                            <div className="flip-face card absolute inset-0 flex flex-col p-5">
                                <span className="eyebrow">Question {i + 1}</span>
                                <p className="mt-3 flex-1 overflow-hidden font-medium leading-snug">{c.q}</p>
                            </div>
                            <div className="flip-face flip-back absolute inset-0 flex flex-col rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/15 to-cyan-500/10 p-5">
                                <span className="eyebrow text-brand-500">Answer</span>
                                <p className="mt-3 flex-1 overflow-auto text-sm leading-relaxed">{c.a}</p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

const NotesView: React.FC = () => {
    const userId = progressService.getDbUserId();
    const [notes, setNotes] = useState<NoteRow[]>([]);
    const [loadingNotes, setLoadingNotes] = useState(true);
    const [active, setActive] = useState<NoteRow | null>(null);
    const [composing, setComposing] = useState(true);
    const [sources, setSources] = useState<NoteSource[]>([]);
    const [noteType, setNoteType] = useState<NoteType>('summary');
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteTitle, setPasteTitle] = useState('');
    const [pasteText, setPasteText] = useState('');
    const [generating, setGenerating] = useState(false);
    const [draft, setDraft] = useState('');
    const [view, setView] = useState<'cards' | 'text'>('cards');
    const [panelOpen, setPanelOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmNode, confirm] = useConfirm();
    const fileRef = useRef<HTMLInputElement>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!userId) { setLoadingNotes(false); return; }
        api.getUserNotes(userId).then(setNotes).catch((e) => console.error(e)).finally(() => setLoadingNotes(false));
    }, [userId]);

    const totalChars = sources.reduce((a, s) => a + (s.content?.length || 0), 0);

    const addSource = async (title: string, content: string) => {
        const src = await api.createNoteSource({ noteId: null, type: 'text', title, content, userId: userId ?? null });
        setSources((prev) => [...prev, src]);
    };

    const handleFiles = async (files: FileList | File[]) => {
        const list = Array.from(files).filter((f) => /\.(pdf|txt|md)$/i.test(f.name));
        if (!list.length) { toast.error('Only PDF, TXT and MD files are supported'); return; }
        if (list.length > 5) toast.warning('Up to 5 files at a time — using the first 5');
        const big = list.find((f) => f.size > 10 * 1024 * 1024);
        if (big) { toast.error(`${big.name} is over 10 MB`); return; }
        setUploading(true);
        try {
            const form = new FormData();
            list.slice(0, 5).forEach((f) => form.append('files', f));
            const res = await fetch('/api/notes/upload-files', { method: 'POST', headers: api.authHeaders(), body: form });
            api.handleUnauthorized(res);
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) throw new Error(data?.error || `Upload failed (HTTP ${res.status})`);
            for (const f of data.files || []) {
                if (f.content?.trim()) await addSource(f.filename, f.content);
            }
            const skipped: string[] = data.skipped || [];
            if (skipped.length) toast.warning(`Couldn’t read: ${skipped.join(', ')}`);
            if ((data.files || []).length) toast.success(`Added ${(data.files || []).length} source${data.files.length === 1 ? '' : 's'}`);
        } catch (err: any) {
            toast.error('Upload failed', { description: err?.message });
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const addPasted = async () => {
        if (!pasteText.trim()) return;
        try {
            await addSource(pasteTitle.trim() || `Pasted text ${sources.length + 1}`, pasteText.trim());
            setPasteTitle(''); setPasteText(''); setPasteOpen(false);
        } catch (err: any) { toast.error('Couldn’t add that source', { description: err?.message }); }
    };

    const budgetedSources = (): NoteSource[] => {
        if (totalChars <= SOURCE_BUDGET) return sources;
        const ratio = SOURCE_BUDGET / totalChars;
        return sources.map((s) => ({ ...s, content: s.content.slice(0, Math.floor(s.content.length * ratio)) }));
    };

    const generate = async () => {
        if (!userId || !sources.length) return;
        setGenerating(true);
        setDraft('');
        setActive(null);
        setComposing(false);
        try {
            let content = '';
            await notesService.generateNotesStream({ sources: budgetedSources(), noteType, useRAG: true }, (chunk) => {
                content = chunk;
                setDraft(chunk);
            });
            const created = await api.createNote({ userId, title: noteTitle(content, noteType, sources), type: noteType, content, sourceIds: sources.map((s) => s.id) });
            const full = await api.getNote(created.id);
            setNotes((prev) => [full, ...prev]);
            setActive(full);
            setSources([]);
            toast.success('Notes ready');
        } catch (err: any) {
            console.error(err);
            toast.error('Couldn’t generate notes', { description: err?.message });
            setComposing(true);
        } finally {
            setGenerating(false);
            setDraft('');
        }
    };

    const openNote = async (n: NoteRow) => {
        setComposing(false);
        setPanelOpen(false);
        setActive(n);
        try { setActive(await api.getNote(n.id)); } catch { /* keep the list copy */ }
    };

    const removeNote = async (n: NoteRow) => {
        const ok = await confirm({ title: 'Delete these notes?', description: `“${n.title}” will be permanently removed.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        try {
            await api.deleteNote(n.id);
            setNotes((prev) => prev.filter((x) => x.id !== n.id));
            if (active?.id === n.id) { setActive(null); setComposing(true); }
        } catch (err: any) { toast.error('Delete failed', { description: err?.message }); }
    };

    const exportPdf = () => {
        if (!active || !printRef.current) return;
        const w = window.open('', '_blank');
        if (!w) { toast.error('Allow pop-ups to export'); return; }
        const doc = w.document;
        doc.open();
        doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;padding:40px;line-height:1.6;color:#111;max-width:860px;margin:0 auto}h1{color:#5833cf;border-bottom:2px solid #eee;padding-bottom:8px}h2{margin-top:28px}code{background:#f3f3f7;padding:2px 6px;border-radius:4px}pre{background:#f6f6fa;padding:14px;border-radius:8px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}.not-prose button{display:none}</style></head><body></body></html>');
        doc.close();
        doc.title = active.title;
        const h1 = doc.createElement('h1');
        h1.textContent = active.title;
        doc.body.appendChild(h1);
        doc.body.appendChild(doc.importNode(printRef.current, true));
        setTimeout(() => w.print(), 250);
    };

    const exportPptx = async () => {
        if (!active) return;
        const toastId = toast.loading('Building slides…');
        try {
            const { default: PptxGenJS } = await import('pptxgenjs');
            const pptx = new PptxGenJS();
            pptx.layout = 'LAYOUT_WIDE';
            const accent = '7C5CFF';
            const title = pptx.addSlide();
            title.background = { color: '0D0B1D' };
            title.addText(active.title, { x: 0.6, y: 2.4, w: 12, h: 1.4, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI' });
            title.addText(`${typeMeta(active.type).label} · Cognify`, { x: 0.6, y: 3.8, w: 12, h: 0.6, fontSize: 18, color: 'B6A3FF' });

            const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/^\s*[-*+]\s+/, '').trim();
            const cards = active.type === 'flashcards' ? parseFlashcards(active.content) : [];
            const sections: { heading: string; bullets: string[] }[] = cards.length
                ? cards.map((c, i) => ({ heading: `Q${i + 1}. ${c.q}`, bullets: [c.a] }))
                : active.content.split(/\n(?=##\s)/).map((block) => {
                    const lines = block.split('\n').filter((l) => l.trim() && !/^#\s/.test(l));
                    const heading = clean((lines.find((l) => /^#{2,3}\s/.test(l)) || '').replace(/^#+\s*/, '')) || active.title;
                    const bullets = lines.filter((l) => !/^#{2,3}\s/.test(l)).map(clean).filter(Boolean);
                    return { heading, bullets };
                }).filter((s) => s.bullets.length);

            for (const s of sections) {
                for (let i = 0; i < s.bullets.length; i += 7) {
                    const slide = pptx.addSlide();
                    slide.background = { color: 'FFFFFF' };
                    slide.addShape('rect' as any, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: accent } });
                    slide.addText(s.heading + (i ? ' (cont.)' : ''), { x: 0.6, y: 0.4, w: 12, h: 0.9, fontSize: 26, bold: true, color: '1A1A2E' });
                    slide.addText(s.bullets.slice(i, i + 7).map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), {
                        x: 0.6, y: 1.4, w: 12, h: 5.6, fontSize: 16, color: '33334D', valign: 'top', paraSpaceAfter: 8,
                    });
                }
            }
            await pptx.writeFile({ fileName: `${active.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 60) || 'notes'}.pptx` });
            toast.success('Slides downloaded', { id: toastId });
        } catch (err: any) {
            toast.error('Export failed', { id: toastId, description: err?.message });
        }
    };

    const content = generating ? draft : active?.content || '';
    const cards = useMemo(() => (active?.type === 'flashcards' || (generating && noteType === 'flashcards') ? parseFlashcards(content) : []), [content, active?.type, generating, noteType]);
    const showCards = cards.length > 0 && view === 'cards';

    const library = (
        <div className="flex h-full flex-col">
            <div className="p-3">
                <Button variant="primary" className="w-full" icon={<Plus className="size-4" />} onClick={() => { setActive(null); setComposing(true); setPanelOpen(false); }}>
                    New notes
                </Button>
            </div>
            <div className="eyebrow px-5 pb-2">Library</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {loadingNotes ? (
                    <div className="space-y-1.5 px-1">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
                ) : notes.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-subtle">Generated notes are saved here.</p>
                ) : notes.map((n) => {
                    const meta = typeMeta(n.type);
                    return (
                        <div
                            key={n.id}
                            onClick={() => openNote(n)}
                            className={cn('group mb-1 flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition', active?.id === n.id ? 'bg-brand-500/10' : 'hover:bg-sunken')}
                        >
                            <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white', meta.gradient)}><meta.icon className="size-4" /></div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{n.title}</div>
                                <div className="text-[11px] text-subtle">{meta.label} · {timeAgo(n.updated_at || n.created_at || Date.now())}</div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); removeNote(n); }} className="rounded p-1 text-subtle opacity-0 transition hover:text-red-500 group-hover:opacity-100" title="Delete">
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className="flex h-full">
            {confirmNode}
            <aside className="hidden w-72 shrink-0 border-r border-line bg-surface/50 backdrop-blur-xl md:block">{library}</aside>
            <AnimatePresence>
                {panelOpen && (
                    <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="absolute inset-0 bg-black/50" onClick={() => setPanelOpen(false)} />
                        <motion.div className="absolute inset-y-0 left-0 w-[85%] max-w-xs bg-surface" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}>
                            {library}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="min-w-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
                    <Button variant="ghost" size="sm" className="mb-4 md:hidden" icon={<PanelLeft className="size-4" />} onClick={() => setPanelOpen(true)}>Library</Button>

                    {composing ? (
                        <div>
                            <div className="eyebrow">Notes</div>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Turn your material into <span className="font-serif font-normal italic text-gradient">study notes</span></h1>
                            <p className="mt-2 max-w-2xl text-muted">Add PDFs or text, choose a format, and Cognify writes notes using only what you provided.</p>

                            {/* step 1 */}
                            <div className="mt-8 flex items-center gap-2 text-sm font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-brand-500 text-xs text-white">1</span> Add sources</div>
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                                onClick={() => !uploading && fileRef.current?.click()}
                                className={cn(
                                    'mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
                                    dragging ? 'border-brand-500 bg-brand-500/10' : 'border-line-strong hover:border-brand-500/50 hover:bg-sunken/50',
                                )}
                            >
                                {uploading ? <Spinner className="size-8" /> : <UploadCloud className={cn('size-9', dragging ? 'text-brand-500' : 'text-subtle')} />}
                                <p className="mt-3 font-medium">{uploading ? 'Reading your files…' : 'Drop files here or click to browse'}</p>
                                <p className="mt-1 text-xs text-subtle">PDF, TXT or Markdown · up to 5 files, 10 MB each</p>
                                <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md" hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                            </div>

                            <AnimatePresence initial={false}>
                                {pasteOpen ? (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                        <div className="card mt-3 space-y-2 p-4">
                                            <input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Title (optional)" className="input" />
                                            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} placeholder="Paste lecture notes, an article, a transcript…" className="input resize-y" />
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>Cancel</Button>
                                                <Button variant="primary" size="sm" disabled={!pasteText.trim()} onClick={addPasted}>Add source</Button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <Button variant="ghost" size="sm" className="mt-2" icon={<Type className="size-4" />} onClick={() => setPasteOpen(true)}>Or paste text</Button>
                                )}
                            </AnimatePresence>

                            {sources.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {sources.map((s) => (
                                        <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card flex items-center gap-3 p-3">
                                            <div className="flex size-9 items-center justify-center rounded-lg bg-sunken text-subtle"><FileUp className="size-4" /></div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">{s.title}</div>
                                                <div className="text-[11px] text-subtle">{(s.content?.length || 0).toLocaleString()} characters</div>
                                            </div>
                                            <button onClick={() => setSources((prev) => prev.filter((x) => x.id !== s.id))} className="rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-ink" title="Remove"><X className="size-4" /></button>
                                        </motion.div>
                                    ))}
                                    {totalChars > SOURCE_BUDGET && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400">Your sources are long, so each will be trimmed proportionally to fit the AI’s context.</p>
                                    )}
                                </div>
                            )}

                            {/* step 2 */}
                            <div className="mt-8 flex items-center gap-2 text-sm font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-brand-500 text-xs text-white">2</span> Choose a format</div>
                            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                                {NOTE_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        onClick={() => setNoteType(t.value)}
                                        className={cn('card relative p-4 text-left transition', noteType === t.value ? 'border-brand-500/60 ring-4 ring-brand-500/10' : 'hover:border-line-strong')}
                                    >
                                        {noteType === t.value && <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-brand-500 text-white"><Check className="size-3" strokeWidth={3} /></span>}
                                        <div className={cn('flex size-9 items-center justify-center rounded-lg bg-gradient-to-br text-white', t.gradient)}><t.icon className="size-[18px]" /></div>
                                        <div className="mt-3 text-sm font-semibold">{t.label}</div>
                                        <div className="text-xs text-subtle">{t.body}</div>
                                    </button>
                                ))}
                            </div>

                            <Button variant="primary" size="lg" className="mt-8 w-full sm:w-auto" disabled={!sources.length || !userId} loading={generating} icon={<Sparkles className="size-4" />} onClick={generate}>
                                Generate {typeMeta(noteType).label.toLowerCase()}
                            </Button>
                        </div>
                    ) : (generating || active) ? (
                        <div>
                            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <Button variant="ghost" size="xs" className="-ml-2 mb-2" icon={<ArrowLeft className="size-3.5" />} onClick={() => { setActive(null); setComposing(true); }}>New notes</Button>
                                    <div className="flex items-center gap-2">
                                        <Badge tone="brand">{typeMeta(active?.type || noteType).label}</Badge>
                                        {active?.sources && <Badge>{active.sources.length} source{active.sources.length === 1 ? '' : 's'}</Badge>}
                                        {generating && <Badge tone="info" icon={<Spinner className="size-3" />}>Writing</Badge>}
                                    </div>
                                    <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{active?.title || 'Generating your notes…'}</h1>
                                </div>
                                {active && !generating && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {cards.length > 0 && (
                                            <Button variant="secondary" size="sm" onClick={() => setView(view === 'cards' ? 'text' : 'cards')} icon={view === 'cards' ? <FileText className="size-3.5" /> : <Layers3 className="size-3.5" />}>
                                                {view === 'cards' ? 'Text' : 'Cards'}
                                            </Button>
                                        )}
                                        <Button variant="secondary" size="sm" icon={copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />} onClick={() => { navigator.clipboard?.writeText(active.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>Copy</Button>
                                        <Button variant="secondary" size="sm" icon={<Printer className="size-3.5" />} onClick={exportPdf}>PDF</Button>
                                        <Button variant="secondary" size="sm" icon={<Presentation className="size-3.5" />} onClick={exportPptx}>Slides</Button>
                                        <Button variant="ghost" size="icon-sm" onClick={() => removeNote(active)} title="Delete"><Trash2 className="size-4" /></Button>
                                    </div>
                                )}
                            </div>
                            <div className={cn(!showCards && 'card p-6 sm:p-10')}>
                                {showCards ? <Flashcards cards={cards} /> : content ? (
                                    <div ref={printRef}><Markdown streaming={generating}>{content}</Markdown></div>
                                ) : (
                                    <div className="space-y-3"><div className="skeleton h-7 w-1/2" /><div className="skeleton h-4" /><div className="skeleton h-4 w-5/6" /><div className="skeleton h-4 w-2/3" /></div>
                                )}
                                {showCards && <div ref={printRef} className="hidden"><Markdown>{content}</Markdown></div>}
                            </div>
                        </div>
                    ) : (
                        <EmptyState icon={<NotebookPen />} title="Nothing selected" description="Pick notes from your library or create new ones." action={<Button variant="primary" onClick={() => setComposing(true)} icon={<BookOpenCheck className="size-4" />}>New notes</Button>} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotesView;
