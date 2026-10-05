import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import { githubLight } from '@uiw/codemirror-theme-github';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { html } from '@codemirror/lang-html';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
    Bot, Brain, Bug, Check, Copy, Eye, Files, History, Keyboard, Play, RotateCcw, Sparkles, Square, Terminal, Wand2, X,
} from 'lucide-react';
import { aiService } from '../services/llamaService';
import { LANGUAGES, getLanguageById, getFileName, executeCode, type ExecutionResult } from '../services/codeExecutionService';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';
import { useTheme } from '../lib/theme';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';
import { Badge, Button, Spinner } from '../ui';
import Markdown from '../ui/Markdown';

const LANG_STYLE: Record<string, { short: string; color: string }> = {
    python: { short: 'PY', color: '#3b82f6' }, javascript: { short: 'JS', color: '#eab308' }, java: { short: 'JV', color: '#ef4444' },
    go: { short: 'GO', color: '#06b6d4' }, rust: { short: 'RS', color: '#c2410c' }, c: { short: 'C', color: '#64748b' },
    cpp: { short: 'C++', color: '#4f46e5' }, html: { short: 'WEB', color: '#ec4899' },
};
const LangChip: React.FC<{ id: string; className?: string }> = ({ id, className }) => {
    const s = LANG_STYLE[id] || { short: '?', color: '#64748b' };
    return <span className={cn('flex h-6 min-w-7 items-center justify-center rounded-md px-1 font-mono text-[10px] font-extrabold text-white', className)} style={{ background: s.color }}>{s.short}</span>;
};

const extensionFor = (id: string) => {
    switch (id) {
        case 'python': return [python()];
        case 'javascript': return [javascript()];
        case 'java': return [java()];
        case 'c': case 'cpp': return [cpp()];
        case 'rust': return [rust()];
        case 'go': return [go()];
        case 'html': return [html()];
        default: return [];
    }
};

const DRAFT = (id: string) => `cognify_draft_${id}`;
const LAST = 'cognify_playground_lang';
const loadDraft = (id: string) => { try { return localStorage.getItem(DRAFT(id)) ?? getLanguageById(id)?.defaultCode ?? ''; } catch { return getLanguageById(id)?.defaultCode ?? ''; } };

type Panel = 'files' | 'history' | 'ai' | null;
type OutTab = 'console' | 'preview' | 'ai';

const Practice: React.FC = () => {
    const { theme } = useTheme();
    const [langId, setLangId] = useState(() => { try { const l = localStorage.getItem(LAST); return l && getLanguageById(l) ? l : 'python'; } catch { return 'python'; } });
    const [code, setCode] = useState(() => loadDraft(langId));
    const [stdin, setStdin] = useState('');
    const [showStdin, setShowStdin] = useState(false);
    const [panel, setPanel] = useState<Panel>(() => (typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'files' : null));
    const [out, setOut] = useState<OutTab>(() => (getLanguageById(langId)?.isWebLang ? 'preview' : 'console'));
    const [result, setResult] = useState<ExecutionResult | null>(null);
    const [runMs, setRunMs] = useState<number | null>(null);
    const [running, setRunning] = useState(false);
    const [ai, setAi] = useState<{ mode: 'idle' | 'review' | 'explain' | 'generate'; text: string; title: string }>({ mode: 'idle', text: '', title: '' });
    const [prompt, setPrompt] = useState('');
    const [history, setHistory] = useState<any[] | null>(null);
    const [copied, setCopied] = useState(false);
    const [preview, setPreview] = useState(code);
    const runRef = useRef<() => void>(() => {});
    const lang = getLanguageById(langId) || LANGUAGES[0];

    useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(DRAFT(langId), code); } catch { /* quota */ } }, 400); return () => clearTimeout(t); }, [code, langId]);
    useEffect(() => { if (!lang.isWebLang) return; const t = setTimeout(() => setPreview(code), 350); return () => clearTimeout(t); }, [code, lang.isWebLang]);

    const loadHistory = useCallback(async () => {
        const uid = progressService.getDbUserId();
        if (!uid) { setHistory([]); return; }
        try { setHistory(await api.getCodeHistory(uid, 40)); } catch { setHistory([]); }
    }, []);
    useEffect(() => { if (panel === 'history' && history === null) loadHistory(); }, [panel, history, loadHistory]);

    const switchLang = (id: string) => {
        const next = getLanguageById(id);
        if (!next) return;
        setLangId(id); setCode(loadDraft(id)); setResult(null); setRunMs(null);
        setOut(next.isWebLang ? 'preview' : 'console');
        try { localStorage.setItem(LAST, id); } catch { /* storage unavailable */ }
        if (window.innerWidth < 1280) setPanel(null);
    };

    const run = useCallback(async () => {
        if (lang.isWebLang) { setPreview(code); setOut('preview'); return; }
        if (running) return;
        setRunning(true); setResult(null); setOut('console');
        const t0 = performance.now();
        try {
            const r = await executeCode(langId, code, stdin);
            setResult(r); setRunMs(Math.round(performance.now() - t0));
            const uid = progressService.getDbUserId();
            if (uid) api.saveCodeRun({ user_id: uid, language: langId, code, stdin, output: (r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '') }).then(() => setHistory(null)).catch(() => {});
        } finally { setRunning(false); }
    }, [lang.isWebLang, running, langId, code, stdin]);
    runRef.current = run;

    const extensions = useMemo(() => [...extensionFor(langId), Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { runRef.current(); return true; } }]))], [langId]);

    const streamAi = async (mode: 'review' | 'explain', title: string, fn: (cb: (t: string) => void) => Promise<string>) => {
        if (ai.mode !== 'idle') return;
        setAi({ mode, text: '', title }); setOut('ai');
        try { await fn((t) => setAi((a) => ({ ...a, text: t }))); }
        catch (err: any) { setAi((a) => ({ ...a, text: `**The AI is unavailable right now.** ${err?.message || ''}` })); }
        finally { setAi((a) => ({ ...a, mode: 'idle' })); }
    };
    const review = () => streamAi('review', 'Code review', (cb) => aiService.getDetailedInsights(code, lang.label, cb));
    const explainError = () => streamAi('explain', 'Why it failed', (cb) => aiService.chatStream(
        [{ role: 'user', content: `My ${lang.label} program failed.\n\nCode:\n\`\`\`\n${code.slice(0, 8000)}\n\`\`\`\n\nOutput / error:\n\`\`\`\n${(result?.stderr || result?.stdout || '').slice(0, 4000)}\n\`\`\`` }],
        cb, 'You are a patient debugging coach. Explain in plain words what the error means, point to the exact line responsible, and show the corrected code. Keep it short and use markdown.'));

    const generate = async () => {
        if (!prompt.trim() || ai.mode !== 'idle') return;
        setAi({ mode: 'generate', text: '', title: '' });
        const prev = code;
        setCode('');
        try {
            await aiService.generateCode(prompt.trim(), lang.label, (t) => { const m = t.match(/^\s*```[\w+-]*\n?([\s\S]*?)(```\s*)?$/); setCode(m ? m[1] : t); });
            toast.success('Code generated', { description: 'Press Run (Ctrl/⌘ + Enter) to try it.' });
            setPrompt('');
        } catch (err: any) { setCode(prev); toast.error('Generation failed', { description: err?.message }); }
        finally { setAi((a) => ({ ...a, mode: 'idle' })); }
    };

    const failed = !!result && (result.exitCode !== 0 || !!result.signal);

    const rail: { id: Exclude<Panel, null>; icon: React.ComponentType<any>; label: string }[] = [
        { id: 'files', icon: Files, label: 'Languages' },
        { id: 'history', icon: History, label: 'Run history' },
        { id: 'ai', icon: Bot, label: 'AI assistant' },
    ];

    return (
        <div className="relative flex h-full">
            {/* activity rail */}
            <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r-2 border-line bg-surface py-3">
                {rail.map((r) => (
                    <button key={r.id} title={r.label} onClick={() => setPanel((p) => (p === r.id ? null : r.id))}
                        className={cn('relative flex size-10 items-center justify-center rounded-xl transition', panel === r.id ? 'bg-brand-500/12 text-brand-600 dark:text-brand-300' : 'text-subtle hover:bg-sunken hover:text-ink')}>
                        {panel === r.id && <span className="absolute -left-[9px] h-6 w-1 rounded-r-full bg-brand-500" />}
                        <r.icon className="size-5" />
                    </button>
                ))}
            </div>

            {/* side panel */}
            <AnimatePresence initial={false}>
                {panel && (
                    <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 272, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                        className="absolute inset-y-0 left-14 z-20 shrink-0 overflow-hidden border-r-2 border-line bg-surface xl:relative xl:left-0">
                        <div className="flex h-full w-[272px] flex-col">
                            <div className="flex items-center justify-between px-4 pb-2 pt-4">
                                <span className="eyebrow">{rail.find((r) => r.id === panel)?.label}</span>
                                <button onClick={() => setPanel(null)} className="rounded p-1 text-subtle hover:bg-sunken xl:hidden"><X className="size-4" /></button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                                {panel === 'files' && LANGUAGES.map((l) => (
                                    <button key={l.id} onClick={() => switchLang(l.id)}
                                        className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm font-semibold', l.id === langId ? 'bg-brand-500/10 text-ink' : 'text-muted hover:bg-sunken')}>
                                        <LangChip id={l.id} />
                                        <span className="flex-1">{l.label}</span>
                                        <span className="text-[11px] text-subtle">{l.isWebLang ? 'browser' : l.pistonVersion}</span>
                                    </button>
                                ))}
                                {panel === 'history' && (history === null ? [0, 1, 2].map((i) => <div key={i} className="skeleton mb-2 h-14" />) : history.length === 0 ? (
                                    <p className="px-3 py-6 text-center text-sm text-subtle">Runs you make appear here.</p>
                                ) : history.map((h) => (
                                    <button key={h.id} onClick={() => { if (getLanguageById(h.language)) { if (h.language !== langId) switchLang(h.language); setCode(h.code); if (h.stdin) { setStdin(h.stdin); setShowStdin(true); } } }}
                                        className="mb-1 flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-sunken">
                                        <LangChip id={h.language} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-mono text-xs font-semibold">{String(h.code).split('\n').find((x: string) => x.trim()) || ''}</div>
                                            <div className="text-[11px] text-subtle">{timeAgo(h.created_at)}</div>
                                        </div>
                                    </button>
                                )))}
                                {panel === 'ai' && (
                                    <div className="space-y-4 px-2">
                                        <div>
                                            <div className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Wand2 className="size-4 text-brand-500" /> Generate {lang.label}</div>
                                            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="Describe a program… e.g. a binary search with tests" className="input resize-none text-sm" />
                                            <Button variant="primary" size="sm" className="mt-2 w-full" loading={ai.mode === 'generate'} disabled={!prompt.trim()} onClick={generate}>Write the code</Button>
                                        </div>
                                        <div className="space-y-2 border-t-2 border-line pt-4">
                                            <Button variant="secondary" size="sm" className="w-full" icon={<Brain className="size-4 text-sky-500" />} onClick={review} loading={ai.mode === 'review'}>Review my code</Button>
                                            <Button variant="secondary" size="sm" className="w-full" icon={<Bug className="size-4 text-coral" />} onClick={explainError} disabled={!failed} loading={ai.mode === 'explain'}>Explain last error</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* workspace */}
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-12 shrink-0 items-center gap-2 border-b-2 border-line bg-surface px-2">
                    <div className="flex h-full items-center gap-2 border-b-[3px] border-brand-500 px-3 font-mono text-sm font-semibold">
                        <LangChip id={langId} /> {getFileName(lang)}
                    </div>
                    {ai.mode === 'generate' && <Badge tone="brand" icon={<Spinner className="size-3" />}>AI is typing</Badge>}
                    <div className="ml-auto flex items-center gap-1">
                        {lang.supportsStdin && <Button variant={showStdin ? 'soft' : 'ghost'} size="icon-sm" title="Program input" onClick={() => setShowStdin((s) => !s)}><Keyboard className="size-4" /></Button>}
                        <Button variant="ghost" size="icon-sm" title="Copy" onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}>{copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}</Button>
                        <Button variant="ghost" size="icon-sm" title="Reset to template" onClick={() => { setCode(lang.defaultCode); toast('Reset to the starter template'); }}><RotateCcw className="size-4" /></Button>
                        <Button variant="success" size="sm" className="ml-1 px-5" onClick={run} loading={running} icon={!running ? <Play className="size-4" fill="currentColor" /> : undefined} title="Run (Ctrl/⌘ + Enter)">
                            {lang.isWebLang ? 'Preview' : 'Run'}
                        </Button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-1">
                    <div className="flex min-h-0 flex-col border-line bg-surface max-lg:border-b-2 lg:border-r-2 dark:bg-[#1a1b26]">
                        <div className="min-h-0 flex-1 overflow-hidden">
                            <CodeMirror value={code} onChange={setCode} theme={theme === 'dark' ? tokyoNight : githubLight} extensions={extensions} height="100%" className="h-full"
                                basicSetup={{ foldGutter: false, tabSize: 4 }} />
                        </div>
                        <AnimatePresence>
                            {showStdin && lang.supportsStdin && (
                                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t-2 border-line bg-surface">
                                    <div className="p-3">
                                        <div className="mb-1.5 text-xs font-bold text-subtle">Program input (stdin) — one value per line</div>
                                        <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={3} className="input resize-none font-mono text-xs" placeholder="Ada" />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex min-h-0 flex-col bg-surface">
                        <div className="flex h-11 shrink-0 items-center gap-1 border-b-2 border-line px-2">
                            {([['console', 'Console', Terminal], ...(lang.isWebLang ? [['preview', 'Preview', Eye]] : []), ['ai', 'AI', Sparkles]] as [OutTab, string, any][]).map(([id, label, Icon]) => (
                                <button key={id} onClick={() => setOut(id)} className={cn('flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold', out === id ? 'bg-sunken text-ink' : 'text-subtle hover:text-muted')}>
                                    <Icon className="size-3.5" /> {label}
                                    {id === 'ai' && ai.mode !== 'idle' && ai.mode !== 'generate' && <Spinner className="size-3" />}
                                </button>
                            ))}
                            {result && out === 'console' && (
                                <div className="ml-auto flex items-center gap-1.5 pr-1">
                                    <Badge tone={failed ? 'danger' : 'success'}>{failed ? (result.signal ? `Killed (${result.signal})` : `Exit ${result.exitCode}`) : 'Success'}</Badge>
                                    {runMs != null && <Badge>{runMs} ms</Badge>}
                                </div>
                            )}
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto">
                            {out === 'console' && (
                                <div className="min-h-full bg-[#14141f] p-4 font-mono text-[13px] leading-relaxed text-[#e6e6f0]">
                                    {running ? <div className="flex items-center gap-2 text-amber-300"><Square className="size-3 animate-pulse" fill="currentColor" /> Running in the sandbox…</div>
                                        : result ? (
                                            <>
                                                {result.stdout && <pre className="whitespace-pre-wrap">{result.stdout}</pre>}
                                                {result.stderr && <pre className="mt-2 whitespace-pre-wrap text-red-300">{result.stderr}</pre>}
                                                {!result.stdout && !result.stderr && <span className="text-white/40">[no output]</span>}
                                                {failed && (
                                                    <button onClick={explainError} className="mt-4 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 font-sans text-xs font-bold text-white hover:bg-white/15">
                                                        <Bug className="size-3.5" /> Explain this error
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-white/45"><span className="text-emerald-400">❯</span> Press <b className="text-white/80">Run</b> or <b className="text-white/80">Ctrl/⌘ + Enter</b>.
                                                <div className="mt-2 text-xs">Sandbox: Python · JavaScript · Java · Go · Rust · C · C++ — plus live HTML preview.</div></div>
                                        )}
                                </div>
                            )}
                            {out === 'preview' && lang.isWebLang && <iframe sandbox="allow-scripts allow-modals" title="Preview" srcDoc={preview} className="h-full w-full border-0 bg-white" />}
                            {out === 'ai' && (
                                <div className="p-5">
                                    {ai.text ? (<><div className="eyebrow mb-3">{ai.title}</div><Markdown streaming={ai.mode !== 'idle'}>{ai.text}</Markdown></>)
                                        : ai.mode !== 'idle' ? <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Thinking…</div>
                                            : (
                                                <div className="flex flex-col items-center py-10 text-center">
                                                    <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-500"><Brain className="size-7" /></div>
                                                    <p className="mt-4 font-bold">Your coding assistant</p>
                                                    <p className="mt-1 max-w-xs text-sm text-muted">Get a review with complexity and bug notes, or an explanation when a run fails.</p>
                                                    <div className="mt-5 flex gap-2">
                                                        <Button variant="primary" size="sm" icon={<Brain className="size-4" />} onClick={review}>Review code</Button>
                                                        <Button variant="secondary" size="sm" icon={<Wand2 className="size-4" />} onClick={() => setPanel('ai')}>Generate</Button>
                                                    </div>
                                                </div>
                                            )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Practice;
