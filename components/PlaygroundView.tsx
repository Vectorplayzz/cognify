import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
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
    Brain, Check, ChevronDown, Copy, Eye, History, Keyboard, Play, RotateCcw, Sparkles, Terminal, Wand2, X,
} from 'lucide-react';
import { aiService } from '../services/llamaService';
import { LANGUAGES, getLanguageById, getFileName, executeCode, type ExecutionResult } from '../services/codeExecutionService';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';
import { useTheme } from '../lib/theme';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';
import { Badge, Button, Kbd, Modal, Segmented, Spinner } from './ui';
import Markdown from './ui/Markdown';

const LANG_STYLE: Record<string, { short: string; color: string }> = {
    python: { short: 'PY', color: 'from-sky-500 to-blue-600' },
    javascript: { short: 'JS', color: 'from-amber-400 to-yellow-500' },
    java: { short: 'JV', color: 'from-orange-500 to-red-500' },
    go: { short: 'GO', color: 'from-cyan-400 to-sky-500' },
    rust: { short: 'RS', color: 'from-orange-600 to-amber-700' },
    c: { short: 'C', color: 'from-slate-500 to-slate-700' },
    cpp: { short: 'C++', color: 'from-blue-600 to-indigo-700' },
    html: { short: '</>', color: 'from-pink-500 to-orange-500' },
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

const DRAFT_KEY = (id: string) => `cognify_draft_${id}`;
const LAST_LANG_KEY = 'cognify_playground_lang';

function loadDraft(id: string): string {
    try { return localStorage.getItem(DRAFT_KEY(id)) ?? getLanguageById(id)?.defaultCode ?? ''; } catch { return getLanguageById(id)?.defaultCode ?? ''; }
}

const LangChip: React.FC<{ id: string; size?: 'sm' | 'md' }> = ({ id, size = 'md' }) => {
    const s = LANG_STYLE[id] || { short: '?', color: 'from-slate-500 to-slate-700' };
    return (
        <span className={cn('flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br font-mono font-bold text-white', s.color, size === 'sm' ? 'h-5 min-w-5 px-1 text-[9px]' : 'h-6 min-w-6 px-1 text-[10px]')}>
            {s.short}
        </span>
    );
};

type RightTab = 'console' | 'preview' | 'insights';

const PlaygroundView: React.FC = () => {
    const { theme } = useTheme();
    const [languageId, setLanguageId] = useState(() => {
        try { const l = localStorage.getItem(LAST_LANG_KEY); return l && getLanguageById(l) ? l : 'python'; } catch { return 'python'; }
    });
    const [code, setCode] = useState(() => loadDraft(languageId));
    const [stdin, setStdin] = useState('');
    const [showStdin, setShowStdin] = useState(false);
    const [result, setResult] = useState<ExecutionResult | null>(null);
    const [runMs, setRunMs] = useState<number | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [rightTab, setRightTab] = useState<RightTab>(() => (getLanguageById(languageId)?.isWebLang ? 'preview' : 'console'));
    const [aiMode, setAiMode] = useState<'idle' | 'insights' | 'generating'>('idle');
    const [insights, setInsights] = useState('');
    const [genOpen, setGenOpen] = useState(false);
    const [genPrompt, setGenPrompt] = useState('');
    const [langOpen, setLangOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [history, setHistory] = useState<any[] | null>(null);
    const [copied, setCopied] = useState(false);
    const [previewDoc, setPreviewDoc] = useState(code);

    const lang = getLanguageById(languageId) || LANGUAGES[0];
    const runRef = useRef<() => void>(() => {});

    // Persist drafts per language.
    useEffect(() => {
        const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY(languageId), code); } catch { /* quota */ } }, 400);
        return () => clearTimeout(t);
    }, [code, languageId]);

    // Debounced live preview for HTML.
    useEffect(() => {
        if (!lang.isWebLang) return;
        const t = setTimeout(() => setPreviewDoc(code), 350);
        return () => clearTimeout(t);
    }, [code, lang.isWebLang]);

    const switchLanguage = (id: string) => {
        const next = getLanguageById(id);
        if (!next) return;
        setLanguageId(id);
        setCode(loadDraft(id));
        setResult(null);
        setRunMs(null);
        setRightTab(next.isWebLang ? 'preview' : 'console');
        setLangOpen(false);
        try { localStorage.setItem(LAST_LANG_KEY, id); } catch { /* storage unavailable */ }
    };

    const handleRun = useCallback(async () => {
        if (lang.isWebLang) { setPreviewDoc(code); setRightTab('preview'); return; }
        if (isExecuting) return;
        setIsExecuting(true);
        setResult(null);
        setRightTab('console');
        const started = performance.now();
        try {
            const r = await executeCode(languageId, code, stdin);
            setResult(r);
            setRunMs(Math.round(performance.now() - started));
            const userId = progressService.getDbUserId();
            if (userId) {
                api.saveCodeRun({ user_id: userId, language: languageId, code, stdin, output: (r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '') })
                    .then(() => setHistory(null))
                    .catch(() => {});
            }
        } finally {
            setIsExecuting(false);
        }
    }, [lang.isWebLang, isExecuting, languageId, code, stdin]);
    runRef.current = handleRun;

    const extensions = useMemo(() => [
        ...extensionFor(languageId),
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { runRef.current(); return true; } }])),
    ], [languageId]);

    const handleInsights = async () => {
        if (aiMode !== 'idle') return;
        setAiMode('insights');
        setInsights('');
        setRightTab('insights');
        try {
            await aiService.getDetailedInsights(code, lang.label, setInsights);
        } catch (err: any) {
            setInsights('');
            toast.error('AI insights unavailable', { description: err?.message });
        } finally {
            setAiMode('idle');
        }
    };

    const handleGenerate = async () => {
        if (!genPrompt.trim()) return;
        setGenOpen(false);
        setAiMode('generating');
        const previous = code;
        setCode('');
        try {
            await aiService.generateCode(genPrompt.trim(), lang.label, (text) => {
                const m = text.match(/^\s*```[\w+-]*\n?([\s\S]*?)(```\s*)?$/);
                setCode(m ? m[1] : text);
            });
            toast.success('Code generated', { description: 'Press Run (⌘/Ctrl + Enter) to try it.' });
        } catch (err: any) {
            setCode(previous);
            toast.error('Generation failed', { description: err?.message });
        } finally {
            setAiMode('idle');
            setGenPrompt('');
        }
    };

    const openHistory = async () => {
        setHistoryOpen(true);
        const userId = progressService.getDbUserId();
        if (!userId || history) return;
        try { setHistory(await api.getCodeHistory(userId, 30)); } catch { setHistory([]); }
    };

    const copyCode = () => {
        navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    };

    const resetCode = () => {
        setCode(lang.defaultCode);
        toast('Reset to the starter template');
    };

    const exitOk = result && result.exitCode === 0 && !result.signal;

    return (
        <div className="flex h-full flex-col gap-3 p-3 sm:p-4 lg:p-5">
            {/* ── toolbar ── */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <button
                        onClick={() => setLangOpen((o) => !o)}
                        className="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-surface/80 pl-2 pr-3 text-sm font-medium transition hover:border-line-strong"
                    >
                        <LangChip id={languageId} />
                        {lang.label}
                        <ChevronDown className="size-4 text-subtle" />
                    </button>
                    <AnimatePresence>
                        {langOpen && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setLangOpen(false)} />
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                    className="card absolute left-0 top-12 z-40 w-60 bg-elevated p-1.5"
                                >
                                    {LANGUAGES.map((l) => (
                                        <button
                                            key={l.id}
                                            onClick={() => switchLanguage(l.id)}
                                            className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-sunken', l.id === languageId && 'bg-brand-500/10')}
                                        >
                                            <LangChip id={l.id} />
                                            <span className="flex-1">{l.label}</span>
                                            <span className="text-[11px] text-subtle">{l.isWebLang ? 'browser' : l.pistonVersion}</span>
                                        </button>
                                    ))}
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>

                <Button variant="success" title="Run (Ctrl/⌘ + Enter)" onClick={handleRun} loading={isExecuting} icon={<Play className="size-4" fill="currentColor" />}>
                    {lang.isWebLang ? 'Preview' : 'Run'}
                </Button>
                <Button variant="secondary" onClick={() => setGenOpen(true)} disabled={aiMode !== 'idle'} loading={aiMode === 'generating'} icon={<Wand2 className="size-4 text-brand-500" />}>
                    <span className="hidden sm:inline">Generate</span>
                </Button>
                <Button variant="secondary" onClick={handleInsights} disabled={aiMode !== 'idle'} loading={aiMode === 'insights'} icon={<Brain className="size-4 text-cyan-500" />}>
                    <span className="hidden sm:inline">AI review</span>
                </Button>

                <div className="ml-auto flex items-center gap-1">
                    {lang.supportsStdin && (
                        <Button variant={showStdin ? 'secondary' : 'ghost'} size="icon" onClick={() => setShowStdin((s) => !s)} title="Program input (stdin)">
                            <Keyboard className="size-4" />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={openHistory} title="Run history"><History className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={copyCode} title="Copy code">{copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}</Button>
                    <Button variant="ghost" size="icon" onClick={resetCode} title="Reset to template"><RotateCcw className="size-4" /></Button>
                </div>
            </div>

            {/* ── generate prompt ── */}
            <AnimatePresence>
                {genOpen && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        onSubmit={(e) => { e.preventDefault(); handleGenerate(); }}
                        className="overflow-hidden"
                    >
                        <div className="card flex items-center gap-2 p-2">
                            <Sparkles className="ml-2 size-4 shrink-0 text-brand-400" />
                            <input
                                autoFocus
                                value={genPrompt}
                                onChange={(e) => setGenPrompt(e.target.value)}
                                placeholder={`Describe a ${lang.label} program… e.g. “fibonacci with memoization”`}
                                className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
                            />
                            <Button type="submit" variant="primary" size="sm" disabled={!genPrompt.trim()}>Generate</Button>
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setGenOpen(false)}><X className="size-4" /></Button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* ── editor + output ── */}
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(280px,1fr)_minmax(220px,1fr)] gap-3 lg:grid-cols-2 lg:grid-rows-1">
                <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] dark:bg-[#1a1b26]">
                    <div className="flex items-center justify-between border-b border-line px-4 py-2">
                        <div className="flex items-center gap-2 font-mono text-xs text-subtle">
                            <LangChip id={languageId} size="sm" /> {getFileName(lang)}
                        </div>
                        <div className="flex items-center gap-2">
                            {aiMode === 'generating' && <Badge tone="brand" icon={<Spinner className="size-3" />}>AI is typing</Badge>}
                            <Badge>{lang.isWebLang ? 'Runs in browser' : 'Sandboxed'}</Badge>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <CodeMirror
                            value={code}
                            onChange={setCode}
                            theme={theme === 'dark' ? tokyoNight : 'light'}
                            extensions={extensions}
                            height="100%"
                            basicSetup={{ highlightActiveLineGutter: true, foldGutter: false, tabSize: 4 }}
                            className="h-full"
                        />
                    </div>
                    <AnimatePresence>
                        {showStdin && lang.supportsStdin && (
                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-line">
                                <div className="p-3">
                                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-subtle"><Keyboard className="size-3.5" /> stdin — one value per line</div>
                                    <textarea
                                        value={stdin}
                                        onChange={(e) => setStdin(e.target.value)}
                                        rows={3}
                                        placeholder="Ada"
                                        className="input resize-none font-mono text-xs"
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
                    <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5">
                        <Segmented<RightTab>
                            size="sm"
                            value={rightTab}
                            onChange={setRightTab}
                            className="border-0 bg-transparent"
                            options={[
                                { value: 'console', label: 'Console', icon: <Terminal /> },
                                ...(lang.isWebLang ? [{ value: 'preview' as RightTab, label: 'Preview', icon: <Eye /> }] : []),
                                { value: 'insights', label: 'AI review', icon: <Brain /> },
                            ]}
                        />
                        {result && rightTab === 'console' && (
                            <div className="flex items-center gap-1.5 pr-2">
                                <Badge tone={exitOk ? 'success' : 'danger'}>{exitOk ? 'Success' : result.signal ? `Killed (${result.signal})` : `Exit ${result.exitCode}`}</Badge>
                                {runMs != null && <Badge>{runMs} ms</Badge>}
                            </div>
                        )}
                    </div>
                    <div className="relative min-h-0 flex-1 overflow-auto">
                        {rightTab === 'console' && (
                            <div className="h-full bg-[#0b0b14] p-4 font-mono text-[13px] leading-relaxed">
                                {isExecuting ? (
                                    <div className="flex items-center gap-2 text-amber-300"><Spinner className="size-4 text-amber-300" /> Running {lang.label} in the sandbox…</div>
                                ) : result ? (
                                    <>
                                        {result.stdout && <pre className="whitespace-pre-wrap text-[#e6e6f0]">{result.stdout}</pre>}
                                        {result.stderr && <pre className="mt-2 whitespace-pre-wrap text-red-300">{result.stderr}</pre>}
                                        {!result.stdout && !result.stderr && <span className="text-white/40">[no output]</span>}
                                        <div className="mt-4 border-t border-white/10 pt-2 text-[11px] text-white/35">
                                            {result.language} {result.version} · exit {result.exitCode ?? '—'}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-white/40">
                                        <span className="text-emerald-400">$</span> ready — press <span className="text-white/70">Run</span> or <span className="text-white/70">⌘/Ctrl + Enter</span>
                                        <div className="mt-3 text-[12px]">Sandbox: Python, JavaScript, Java, Go, Rust, C, C++ · Browser: HTML/CSS/JS</div>
                                    </div>
                                )}
                            </div>
                        )}
                        {rightTab === 'preview' && lang.isWebLang && (
                            <iframe sandbox="allow-scripts allow-modals" className="h-full w-full border-0 bg-white" title="Live preview" srcDoc={previewDoc} />
                        )}
                        {rightTab === 'insights' && (
                            <div className="p-5">
                                {insights ? (
                                    <Markdown streaming={aiMode === 'insights'}>{insights}</Markdown>
                                ) : aiMode === 'insights' ? (
                                    <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Reviewing your code…</div>
                                ) : (
                                    <div className="flex flex-col items-center py-10 text-center">
                                        <div className="flex size-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500"><Brain className="size-6" /></div>
                                        <p className="mt-4 font-medium">Get a senior-engineer review</p>
                                        <p className="mt-1 max-w-xs text-sm text-muted">Complexity, bugs, edge cases and readability scores for the code in the editor.</p>
                                        <Button className="mt-5" variant="primary" icon={<Brain className="size-4" />} onClick={handleInsights}>Run AI review</Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── history ── */}
            <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Run history" description="Your last 30 runs. Click one to load it into the editor." className="max-w-2xl">
                <div className="-mx-2 max-h-[60vh] space-y-1.5 overflow-y-auto px-2">
                    {history === null ? (
                        [0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)
                    ) : history.length === 0 ? (
                        <p className="py-8 text-center text-sm text-subtle">No runs yet.</p>
                    ) : history.map((h) => (
                        <button
                            key={h.id}
                            onClick={() => {
                                if (getLanguageById(h.language)) {
                                    if (h.language !== languageId) switchLanguage(h.language);
                                    setCode(h.code);
                                    if (h.stdin) { setStdin(h.stdin); setShowStdin(true); }
                                    setHistoryOpen(false);
                                }
                            }}
                            className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand-500/40 hover:bg-sunken"
                        >
                            <LangChip id={h.language} />
                            <div className="min-w-0 flex-1">
                                <pre className="truncate font-mono text-xs text-ink">{String(h.code).split('\n').find((l: string) => l.trim()) || ''}</pre>
                                <pre className="mt-1 truncate font-mono text-[11px] text-subtle">{String(h.output || '').split('\n')[0] || '[no output]'}</pre>
                            </div>
                            <span className="shrink-0 text-[11px] text-subtle">{timeAgo(h.created_at)}</span>
                        </button>
                    ))}
                </div>
            </Modal>
        </div>
    );
};

export default PlaygroundView;
