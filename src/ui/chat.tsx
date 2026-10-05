import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowUp, Check, Copy, Mic, RefreshCw, Square, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../lib/cn';
import { timeAgo } from '../lib/format';
import { Spinner } from './index';
import Markdown from './Markdown';

/** Browser speech-to-text, appending into a text field. */
export function useDictation(onText: (t: string) => void) {
    const [listening, setListening] = useState(false);
    const rec = useRef<any>(null);
    useEffect(() => () => rec.current?.stop(), []);
    const toggle = () => {
        if (listening) { rec.current?.stop(); setListening(false); return; }
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { toast.error('Voice input isn’t supported in this browser', { description: 'Try Chrome or Edge.' }); return; }
        const r = new SR();
        r.continuous = true; r.interimResults = true; r.lang = 'en-US';
        let finalText = '';
        r.onresult = (e: any) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
                else interim += e.results[i][0].transcript;
            }
            onText((finalText + interim).trim());
        };
        r.onend = () => setListening(false);
        r.onerror = (e: any) => { setListening(false); if (e.error === 'not-allowed') toast.error('Microphone access was blocked'); };
        r.start();
        rec.current = r;
        setListening(true);
    };
    const stop = () => { rec.current?.stop(); setListening(false); };
    return { listening, toggle, stop };
}

/** Read-aloud for assistant messages. */
export function useSpeaker() {
    const [speaking, setSpeaking] = useState<string | null>(null);
    useEffect(() => () => window.speechSynthesis?.cancel(), []);
    const toggle = (id: string, text: string) => {
        if (speaking === id) { window.speechSynthesis.cancel(); setSpeaking(null); return; }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.replace(/[#*`_>|]/g, ''));
        u.onend = () => setSpeaking(null);
        u.onerror = () => setSpeaking(null);
        window.speechSynthesis.speak(u);
        setSpeaking(id);
    };
    return { speaking, toggle };
}

export const Composer: React.FC<{
    value: string; onChange: (v: string) => void; onSend: () => void; busy?: boolean; placeholder?: string;
    above?: React.ReactNode; footer?: React.ReactNode; inputRef?: React.RefObject<HTMLTextAreaElement | null>; className?: string;
}> = ({ value, onChange, onSend, busy, placeholder, above, footer, inputRef, className }) => {
    const localRef = useRef<HTMLTextAreaElement>(null);
    const ref = inputRef || localRef;
    const dict = useDictation(onChange);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }, [value, ref]);
    const send = () => { if (dict.listening) dict.stop(); onSend(); };
    return (
        <div className={cn('relative mx-auto w-full max-w-3xl', className)}>
            {above}
            <div className={cn('flex items-end gap-2 rounded-3xl border-2 bg-surface p-2 transition focus-within:border-brand-400', dict.listening ? 'border-red-400' : 'border-line')}>
                <button type="button" onClick={dict.toggle} title={dict.listening ? 'Stop' : 'Voice input'}
                    className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl transition', dict.listening ? 'mic-recording bg-red-500 text-white' : 'text-subtle hover:bg-sunken hover:text-ink')}>
                    {dict.listening ? <Square className="size-3.5" fill="currentColor" /> : <Mic className="size-5" />}
                </button>
                <textarea
                    ref={ref as any}
                    rows={1}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={dict.listening ? 'Listening…' : placeholder}
                    className="max-h-[220px] min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] font-medium outline-none placeholder:text-subtle"
                />
                <button type="button" onClick={send} disabled={!value.trim() || busy}
                    className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-[0_3px_0_0_var(--color-brand-700)] transition active:translate-y-[3px] active:shadow-none disabled:bg-sunken disabled:text-subtle disabled:shadow-none">
                    {busy ? <Spinner className="size-4 text-current" /> : <ArrowUp className="size-5" strokeWidth={2.6} />}
                </button>
            </div>
            {footer && <div className="mt-2 text-center text-[11px] font-medium text-subtle">{footer}</div>}
        </div>
    );
};

export const UserBubble: React.FC<{ text: string; name?: string; avatar?: React.ReactNode; mine?: boolean; time?: string }> = ({ text, name, avatar, mine = true, time }) => (
    mine ? (
        <div className="flex justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-brand-500 px-4 py-2.5 text-[15px] font-medium leading-relaxed text-white">{text}</div>
        </div>
    ) : (
        <div className="flex gap-3">
            <div className="shrink-0 pt-0.5">{avatar}</div>
            <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-xs"><span className="font-bold">{name}</span>{time && <span className="text-subtle">{timeAgo(time)}</span>}</div>
                <div className="w-fit max-w-full whitespace-pre-wrap break-words rounded-3xl rounded-tl-lg bg-sunken px-4 py-2.5 text-[15px] leading-relaxed">{text}</div>
            </div>
        </div>
    )
);

export const BotMessage: React.FC<{
    id: string; text: string; name: string; avatar: React.ReactNode; nameClass?: string; streaming?: boolean; status?: React.ReactNode;
    time?: string; onRegenerate?: () => void; speaker: ReturnType<typeof useSpeaker>;
}> = ({ id, text, name, avatar, nameClass, streaming, status, time, onRegenerate, speaker }) => {
    const [copied, setCopied] = useState(false);
    return (
        <div className="group flex gap-3">
            <div className="shrink-0 pt-0.5">{avatar}</div>
            <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-xs"><span className={cn('font-bold', nameClass)}>{name}</span>{time && <span className="text-subtle">{timeAgo(time)}</span>}</div>
                {!text && streaming ? (
                    <div className="flex items-center gap-2 py-1.5 text-sm text-subtle">
                        {status || <span className="flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="size-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: `${d * 140}ms` }} />)}</span>}
                    </div>
                ) : (
                    <Markdown streaming={streaming}>{text}</Markdown>
                )}
                {text && !streaming && (
                    <div className="mt-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
                        <button onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })} className="rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-ink" title="Copy">
                            {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                        </button>
                        <button onClick={() => speaker.toggle(id, text)} className="rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-ink" title="Read aloud">
                            {speaker.speaking === id ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                        </button>
                        {onRegenerate && <button onClick={onRegenerate} className="rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-ink" title="Regenerate"><RefreshCw className="size-4" /></button>}
                    </div>
                )}
            </div>
        </div>
    );
};

export const PersonaAvatar: React.FC<{ emoji: string; color: string; size?: number }> = ({ emoji, color, size = 32 }) => (
    <div className={cn('flex items-center justify-center rounded-xl', color)} style={{ width: size, height: size, fontSize: size * 0.5 }}>{emoji}</div>
);
