import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { motion } from 'motion/react';
import { ArrowRight, BookOpen, Bot, Check, Code2, Crown, Dumbbell, Flame, Lock, Moon, NotebookPen, Play, Star, Sun, Trophy, Users, Zap } from 'lucide-react';
import { signInWithGoogle, hasSession, clearSession } from '../services/apiService';
import { saveProfile } from '../lib/session';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/cn';
import { Button } from '../ui';
import Logo, { LogoMark } from '../shell/Logo';

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

// ── Visual mocks ──
const PathMock: React.FC = () => {
    const nodes = [
        { s: 'done', x: 0 }, { s: 'done', x: 50 }, { s: 'current', x: 70 }, { s: 'locked', x: 40 }, { s: 'locked', x: -20 },
    ];
    return (
        <div className="relative mx-auto w-full max-w-sm">
            <div className="rounded-2xl bg-brand-500 p-4 text-white shadow-[0_5px_0_0_var(--color-brand-700)]">
                <div className="text-xs font-extrabold uppercase tracking-wider text-white/70">Level 2 · 150 XP</div>
                <div className="font-display text-lg font-extrabold">Python for Data Science</div>
            </div>
            <div className="mt-14 space-y-12 pb-4">
                {nodes.map((n, i) => (
                    <div key={i} style={{ transform: `translateX(${n.x}px)` }}>
                    <motion.div initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.15 * i, type: 'spring', bounce: 0.5 }}
                        className="relative flex justify-center">
                        {n.s === 'current' && (
                            <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 1.8, repeat: Infinity }} className="absolute -top-11 rounded-xl border-2 border-line bg-surface px-3 py-1 font-display text-sm font-extrabold uppercase text-brand-500">Start</motion.div>
                        )}
                        <div className={cn('flex size-16 items-center justify-center rounded-full text-white',
                            n.s === 'done' ? 'bg-amber-400 shadow-[0_6px_0_0_#d97706]' : n.s === 'current' ? 'bg-brand-500 shadow-[0_6px_0_0_var(--color-brand-700)]' : 'bg-line text-subtle shadow-[0_6px_0_0_var(--c-line-strong)]')}>
                            {n.s === 'done' ? <Check className="size-7" strokeWidth={4} /> : n.s === 'current' ? <Star className="size-7" fill="currentColor" /> : <Lock className="size-6" />}
                        </div>
                    </motion.div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const QuizMock: React.FC = () => (
    <div className="panel mx-auto w-full max-w-md overflow-hidden">
        <div className="p-5">
            <div className="h-3 overflow-hidden rounded-full bg-sunken"><div className="h-full w-3/5 rounded-full bg-emerald-500" /></div>
            <p className="mt-5 font-display text-lg font-bold">Which method fills missing values in a pandas DataFrame?</p>
            <div className="mt-4 space-y-2">
                {['df.dropna()', 'df.fillna()', 'df.replace()'].map((o, i) => (
                    <div key={o} className={cn('flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 font-mono text-sm font-semibold', i === 1 ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-line')}>
                        <span className={cn('flex size-6 items-center justify-center rounded-md border-2 text-xs', i === 1 ? 'border-emerald-500' : 'border-line')}>{i === 1 ? <Check className="size-3.5" strokeWidth={4} /> : i + 1}</span>{o}
                    </div>
                ))}
            </div>
        </div>
        <div className="flex items-center justify-between bg-emerald-50 px-5 py-4 dark:bg-emerald-950">
            <span className="font-display text-lg font-extrabold text-emerald-600 dark:text-emerald-400">Nicely done!</span>
            <span className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-extrabold uppercase text-white shadow-[0_3px_0_0_#047857]">Continue</span>
        </div>
    </div>
);

const ChatMock: React.FC = () => (
    <div className="panel mx-auto w-full max-w-md space-y-3 p-5">
        <div className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Why do we need a learning rate?</div>
        <div className="flex gap-3">
            <LogoMark className="size-8 shrink-0" />
            <div className="text-sm text-muted">Think of walking downhill in fog. The gradient tells you <b className="text-ink">which way</b> is down; the learning rate decides <b className="text-ink">how big</b> each step is. Too big and you overshoot the valley…</div>
        </div>
        <div className="flex gap-2 pt-1">
            {['Give me an example', 'Quiz me on this'].map((s) => <span key={s} className="rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-muted">{s}</span>)}
        </div>
    </div>
);

const CodeMock: React.FC = () => (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border-2 border-line bg-[#1a1b26] font-mono text-[13px] text-[#c0caf5] shadow-[0_5px_0_0_var(--c-line)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 font-sans text-xs">
            <span className="flex items-center gap-2 text-white/60"><span className="rounded bg-blue-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">PY</span> main.py</span>
            <span className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1 font-bold text-white"><Play className="size-3" fill="currentColor" /> Run</span>
        </div>
        <div className="px-4 py-3 leading-relaxed">
            <div><span className="text-[#bb9af7]">def</span> <span className="text-[#7aa2f7]">fib</span>(n):</div>
            <div className="pl-4"><span className="text-[#bb9af7]">return</span> n <span className="text-[#bb9af7]">if</span> n &lt; <span className="text-[#ff9e64]">2</span> <span className="text-[#bb9af7]">else</span> fib(n-<span className="text-[#ff9e64]">1</span>) + fib(n-<span className="text-[#ff9e64]">2</span>)</div>
            <div className="mt-1"><span className="text-[#7dcfff]">print</span>([fib(i) <span className="text-[#bb9af7]">for</span> i <span className="text-[#bb9af7]">in</span> <span className="text-[#7dcfff]">range</span>(<span className="text-[#ff9e64]">10</span>)])</div>
        </div>
        <div className="border-t border-white/10 bg-black/30 px-4 py-3 text-[#9ece6a]">[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]</div>
    </div>
);

const NotesMock: React.FC = () => (
    <div className="relative mx-auto h-64 w-full max-w-sm">
        <div className="panel absolute left-0 top-6 w-56 rotate-[-6deg] p-5 shadow-[0_5px_0_0_var(--c-line)]">
            <div className="eyebrow">Question</div>
            <p className="mt-2 font-display font-bold">What does TCP guarantee that UDP doesn’t?</p>
        </div>
        <div className="absolute right-0 top-16 w-56 rotate-[5deg] rounded-2xl bg-brand-500 p-5 text-white shadow-[0_5px_0_0_var(--color-brand-700)]">
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/70">Answer</div>
            <p className="mt-2 text-sm font-semibold">Reliable, ordered delivery — lost packets are re-sent and reassembled in order.</p>
        </div>
        <div className="absolute bottom-0 left-8 flex items-center gap-2 rounded-xl border-2 border-line bg-surface px-3 py-2 text-xs font-bold"><NotebookPen className="size-4 text-pink-500" /> From “Networks lecture 4.pdf”</div>
    </div>
);

const LeagueMock: React.FC = () => (
    <div className="panel mx-auto w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 bg-amber-400 px-5 py-3 text-white"><Trophy className="size-6" /><span className="font-display text-lg font-extrabold">Gold League</span></div>
        {[{ n: 'Maya R.', xp: 2340, c: 'hsl(330 70% 55%)' }, { n: 'You', xp: 2105, c: 'hsl(250 70% 55%)', me: true }, { n: 'Leo K.', xp: 1980, c: 'hsl(160 60% 45%)' }].map((u, i) => (
            <div key={u.n} className={cn('flex items-center gap-3 border-b-2 border-line px-5 py-3 last:border-0', u.me && 'bg-brand-500/10')}>
                <span className="w-4 font-display font-extrabold text-subtle">{i + 1}</span>
                <span className="flex size-9 items-center justify-center rounded-full font-bold text-white" style={{ background: u.c }}>{u.n[0]}</span>
                <span className="flex-1 font-bold">{u.n}</span>
                <span className="font-display font-extrabold">{u.xp.toLocaleString()} XP</span>
            </div>
        ))}
    </div>
);

const FEATURES = [
    { kicker: 'Learn', title: 'Any topic becomes a path you can actually follow', body: 'Type “Kubernetes”, “organic chemistry” or “React hooks”. Cognify uses the community-vetted roadmap.sh curriculum when one exists and builds one with AI when it doesn’t — then lays it out as levels you unlock one by one.', mock: <PathMock />, icon: BookOpen, tint: 'text-brand-500' },
    { kicker: 'Lessons', title: 'Bite-sized lessons that check your understanding', body: 'Every level is written for you: an overview, deep-dive parts, and a quiz with instant feedback and explanations. Finish it to earn XP and unlock what’s next.', mock: <QuizMock />, icon: Dumbbell, tint: 'text-emerald-500' },
    { kicker: 'Tutor', title: 'A tutor that knows what you’re reading', body: 'Ask questions mid-lesson and the tutor sees the same page you do. Or open a full conversation — with voice input, web search for fresh facts, and tutors like Socrates or Ada Lovelace.', mock: <ChatMock />, icon: Bot, tint: 'text-sky-500' },
    { kicker: 'Practice', title: 'Write and run real code in your browser', body: 'Python, JavaScript, Java, Go, Rust, C and C++ run in a sandbox, plus a live HTML preview. Stuck? “Explain this error” tells you what went wrong and how to fix it.', mock: <CodeMock />, icon: Code2, tint: 'text-amber-500' },
    { kicker: 'Notes', title: 'Study notes from your own material', body: 'Upload lecture PDFs or paste text, then chat with them or turn them into summaries, study guides, exam prep and flashcards — grounded only in what you gave it.', mock: <NotesMock />, icon: NotebookPen, tint: 'text-pink-500' },
    { kicker: 'Together', title: 'Stay motivated with friends and leagues', body: 'Daily streaks, quests and badges keep momentum. Climb from Bronze to Diamond, or open a study room and summon an AI persona into the conversation.', mock: <LeagueMock />, icon: Users, tint: 'text-violet-500' },
];

const Landing: React.FC = () => {
    const navigate = useNavigate();
    const { theme, toggle } = useTheme();
    const [signedIn, setSignedIn] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (localStorage.getItem('user') && hasSession()) setSignedIn(true);
        else if (localStorage.getItem('user')) clearSession();
    }, []);

    const login = useGoogleLogin({
        onSuccess: async (t) => {
            setBusy(true); setError(null);
            try {
                const { user } = await signInWithGoogle(t.access_token);
                saveProfile({ sub: user.google_id, name: user.name, email: user.email, picture: user.picture });
                navigate('/learn');
            } catch (e: any) { setError(e?.message || 'Sign-in failed. Please try again.'); }
            finally { setBusy(false); }
        },
        onError: () => { setError('Google sign-in was cancelled or failed.'); setBusy(false); },
    });

    const CTA = ({ className }: { className?: string }) => signedIn
        ? <Link to="/learn" className={className}><Button variant="primary" size="xl" uppercase className="w-full">Continue learning <ArrowRight className="size-5" /></Button></Link>
        : <Button variant="primary" size="xl" uppercase loading={busy} onClick={() => login()} className={cn('w-full', className)}>Get started — it’s free</Button>;

    return (
        <div className="min-h-dvh bg-bg">
            <header className="sticky top-0 z-40 border-b-2 border-line bg-bg/95 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
                    <Logo to="/" />
                    <div className="flex items-center gap-2">
                        <button onClick={toggle} className="flex size-10 items-center justify-center rounded-xl text-subtle hover:bg-sunken" title="Theme">{theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}</button>
                        {signedIn ? <Link to="/learn"><Button variant="primary" size="sm" uppercase>Open app</Button></Link>
                            : <Button size="sm" uppercase onClick={() => login()} icon={<GoogleIcon />}>Sign in</Button>}
                    </div>
                </div>
            </header>

            {/* hero */}
            <section className="dot-grid">
                <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-24">
                    <div className="order-2 flex justify-center lg:order-1"><PathMock /></div>
                    <div className="order-1 text-center lg:order-2 lg:text-left">
                        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">
                            The fun, focused way to learn <span className="highlight">anything</span>.
                        </motion.h1>
                        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="mx-auto mt-5 max-w-lg text-lg text-muted lg:mx-0">
                            Pick a topic and Cognify turns it into a path of short lessons, quizzes and practice — with an AI tutor beside you the whole way.
                        </motion.p>
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="mx-auto mt-8 flex max-w-sm flex-col gap-3 lg:mx-0">
                            <CTA />
                            {!signedIn && <Button size="xl" uppercase onClick={() => login()} icon={<GoogleIcon />} className="w-full">I already have an account</Button>}
                            {error && <p role="alert" className="text-sm font-semibold text-red-500">{error}</p>}
                        </motion.div>
                        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-bold text-subtle lg:justify-start">
                            <span className="flex items-center gap-1.5"><Flame className="size-4 text-orange-500" fill="currentColor" /> Daily streaks</span>
                            <span className="flex items-center gap-1.5"><Zap className="size-4 text-amber-500" fill="currentColor" /> XP & leagues</span>
                            <span className="flex items-center gap-1.5"><Crown className="size-4 text-brand-500" /> Free forever</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* features */}
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
                {FEATURES.map((f, i) => (
                    <section key={f.kicker} className="grid items-center gap-10 border-t-2 border-line py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
                        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.6 }} className={cn(i % 2 === 1 && 'lg:order-2')}>
                            <div className={cn('flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest', f.tint)}><f.icon className="size-5" />{f.kicker}</div>
                            <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">{f.title}</h2>
                            <p className="mt-4 text-lg leading-relaxed text-muted">{f.body}</p>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.6 }} className={cn(i % 2 === 1 && 'lg:order-1')}>
                            {f.mock}
                        </motion.div>
                    </section>
                ))}
            </div>

            {/* closing CTA */}
            <section className="bg-brand-500 px-4 py-20 text-center text-white">
                <h2 className="mx-auto max-w-2xl text-4xl font-extrabold sm:text-5xl">Learn something new today.</h2>
                <p className="mx-auto mt-4 max-w-md text-lg text-white/80">Your first course is one sign-in away.</p>
                <div className="mx-auto mt-8 max-w-xs">
                    {signedIn ? <Link to="/learn"><Button size="xl" uppercase className="w-full bg-white text-brand-600 shadow-[0_4px_0_0_rgb(0_0_0/0.25)] active:translate-y-[4px] active:shadow-none">Continue learning</Button></Link>
                        : <Button size="xl" uppercase loading={busy} onClick={() => login()} className="w-full bg-white text-brand-600 shadow-[0_4px_0_0_rgb(0_0_0/0.25)] active:translate-y-[4px] active:shadow-none">Get started</Button>}
                </div>
            </section>

            <footer className="border-t-2 border-line py-10">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm font-semibold text-subtle sm:flex-row sm:px-6">
                    <Logo to="/" />
                    <span>© {new Date().getFullYear()} Cognify · Learn something every day</span>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
