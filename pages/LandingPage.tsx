import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { motion, type Variants } from 'motion/react';
import {
    ArrowRight, Bot, Check, CheckCircle2, Code2, Flame, Lock, Map, Moon, NotebookPen, Play,
    Sparkles, Sun, Trophy, Users, Zap,
} from 'lucide-react';
import { signInWithGoogle, hasSession, clearSession } from '../services/apiService';
import { saveProfile, useProfile, Profile } from '../lib/session';
import { useTheme } from '../lib/theme';
import { firstName } from '../lib/format';
import { Avatar, Button } from '../components/ui';
import Logo from '../components/Logo';

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 18 },
    show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } }),
};

const TOPICS = ['Machine Learning', 'React', 'System Design', 'Rust', 'Data Science', 'Cybersecurity', 'Kubernetes', 'Python', 'SQL', 'Deep Learning', 'Go', 'DevOps'];

/** A miniature, animated mock of the product used as the hero visual. */
const HeroPreview: React.FC = () => (
    <div className="relative mx-auto w-full max-w-5xl">
        <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[3rem] bg-gradient-to-b from-brand-500/25 via-cyan-400/10 to-transparent blur-3xl" />
        <div className="card ring-gradient overflow-hidden rounded-3xl bg-surface/90 p-2 shadow-2xl shadow-brand-900/20">
            <div className="flex items-center gap-1.5 px-3 py-2">
                <span className="size-2.5 rounded-full bg-red-400/70" />
                <span className="size-2.5 rounded-full bg-amber-400/70" />
                <span className="size-2.5 rounded-full bg-emerald-400/70" />
                <div className="mx-auto hidden rounded-md bg-sunken px-3 py-0.5 font-mono text-[11px] text-subtle sm:block">cognify.ourspaces.net/roadmap</div>
            </div>
            <div className="grid gap-2 md:grid-cols-[1.25fr_1fr]">
                {/* roadmap column */}
                <div className="rounded-2xl border border-line bg-bg/60 p-5 text-left">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="eyebrow">Your path</div>
                            <div className="mt-1 text-lg font-semibold">Machine Learning</div>
                        </div>
                        <div className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-500">42% done</div>
                    </div>
                    <div className="relative mt-5 space-y-3 pl-6">
                        <div className="absolute bottom-3 left-[9px] top-3 w-px bg-gradient-to-b from-emerald-400 via-brand-400 to-line" />
                        {[
                            { t: 'Python & NumPy foundations', s: 'done' },
                            { t: 'Linear regression from scratch', s: 'done' },
                            { t: 'Classification & evaluation', s: 'active' },
                            { t: 'Neural networks', s: 'locked' },
                        ].map((l, i) => (
                            <motion.div
                                key={l.t}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.6 + i * 0.12 }}
                                className="relative"
                            >
                                <span className={`absolute -left-6 top-3 flex size-[18px] items-center justify-center rounded-full border-2 ${l.s === 'done' ? 'border-emerald-400 bg-emerald-400' : l.s === 'active' ? 'border-brand-400 bg-bg' : 'border-line-strong bg-bg'}`}>
                                    {l.s === 'done' && <Check className="size-2.5 text-white" strokeWidth={4} />}
                                    {l.s === 'active' && <span className="size-1.5 animate-ping rounded-full bg-brand-400" />}
                                </span>
                                <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${l.s === 'active' ? 'border-brand-500/40 bg-brand-500/10 font-medium' : 'border-line bg-surface/60'} ${l.s === 'locked' ? 'text-subtle' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>{l.t}</span>
                                        {l.s === 'locked' ? <Lock className="size-3.5" /> : <span className="text-[11px] text-subtle">+100 XP</span>}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
                {/* tutor + code column */}
                <div className="flex flex-col gap-2">
                    <div className="flex-1 rounded-2xl border border-line bg-bg/60 p-4 text-left">
                        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-subtle">
                            <Bot className="size-4 text-brand-400" /> AI Tutor
                        </div>
                        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-3.5 py-2 text-sm text-white">Why does gradient descent need a learning rate?</div>
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.2 }}
                            className="mt-2.5 max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2 text-sm text-muted"
                        >
                            Think of walking downhill in fog: the gradient tells you <b className="text-ink">which way</b> is down, the learning rate decides <b className="text-ink">how big</b> each step is…
                        </motion.div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#0b0b14] p-4 text-left font-mono text-[12px] leading-relaxed text-[#e6e6f0]">
                        <div className="mb-2 flex items-center justify-between font-sans text-[11px] text-white/40">
                            <span>main.py</span>
                            <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300"><Play className="size-3" fill="currentColor" /> Ran in 0.4s</span>
                        </div>
                        <div><span className="text-[#b6a3ff]">for</span> step <span className="text-[#b6a3ff]">in</span> <span className="text-[#67e8f9]">range</span>(<span className="text-[#fdba74]">3</span>):</div>
                        <div className="pl-4">w -= lr * grad(w)</div>
                        <div className="mt-2 text-emerald-300">loss: 0.412 → 0.198 → 0.087 ✓</div>
                    </div>
                </div>
            </div>
        </div>

        {/* floating chips */}
        <motion.div
            className="card absolute -left-10 top-[46%] hidden items-center gap-2 bg-elevated px-3 py-2 text-sm font-semibold lg:flex"
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 }}
        >
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-300 to-orange-500 text-white"><Zap className="size-4" fill="currentColor" /></span>
            +100 XP
        </motion.div>
        <motion.div
            className="card absolute -right-4 bottom-20 hidden items-center gap-2 bg-elevated px-3 py-2 text-sm font-semibold lg:flex"
            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 }}
        >
            <Flame className="size-5 text-orange-500" /> 12-day streak
        </motion.div>
    </div>
);

const FEATURES = [
    {
        icon: Map, title: 'Roadmaps for anything', gradient: 'from-brand-500 to-indigo-500', span: 'md:col-span-2',
        body: 'Type a topic. Cognify pulls the community-vetted path from roadmap.sh when one exists, and builds one with AI when it doesn’t — then writes every lesson and quiz.',
    },
    {
        icon: Bot, title: 'A tutor that remembers', gradient: 'from-cyan-500 to-sky-600', span: '',
        body: 'Conversations are saved, searchable and voice-enabled, with live web search when a question needs fresh facts.',
    },
    {
        icon: Code2, title: 'Run real code', gradient: 'from-emerald-500 to-teal-600', span: '',
        body: 'Python, JavaScript, Java, Go, Rust, C and C++ in a sandbox — plus live HTML preview and AI code review.',
    },
    {
        icon: NotebookPen, title: 'Notes from your sources', gradient: 'from-pink-500 to-rose-600', span: '',
        body: 'Drop in PDFs or text and get summaries, study guides, exam prep or flip-able flashcards grounded only in what you gave it.',
    },
    {
        icon: Users, title: 'Study rooms', gradient: 'from-amber-500 to-orange-600', span: '',
        body: 'Invite friends with a code and summon @Socrates, @Ada, @Newton or @Turing into the conversation.',
    },
    {
        icon: Trophy, title: 'Momentum you can see', gradient: 'from-violet-500 to-fuchsia-600', span: 'md:col-span-2',
        body: 'XP, levels, daily streaks, badges and a leaderboard turn steady practice into something you want to come back to.',
    },
];

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const profile = useProfile();
    const { theme, toggle } = useTheme();
    const [signedIn, setSignedIn] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    useEffect(() => {
        // A stored profile only counts as signed in while its session is valid.
        if (localStorage.getItem('user') && hasSession()) setSignedIn(true);
        else if (localStorage.getItem('user')) clearSession();
    }, []);

    const login = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setIsLoggingIn(true);
            setLoginError(null);
            try {
                // The server verifies the Google token and issues a Cognify session.
                const { user: account } = await signInWithGoogle(tokenResponse.access_token);
                const p: Profile = { sub: account.google_id, name: account.name, email: account.email, picture: account.picture };
                saveProfile(p);
                setSignedIn(true);
                navigate('/home');
            } catch (error: any) {
                console.error('Login failed:', error);
                setLoginError(error?.message || 'Sign-in failed. Please try again.');
            } finally {
                setIsLoggingIn(false);
            }
        },
        onError: () => {
            setLoginError('Google sign-in was cancelled or failed.');
            setIsLoggingIn(false);
        },
    });

    const signOut = () => {
        googleLogout();
        clearSession();
        setSignedIn(false);
    };

    const PrimaryCTA = ({ size = 'lg' as const }) => signedIn ? (
        <Link to="/home">
            <Button variant="primary" size={size} icon={<Sparkles className="size-4" />}>
                Continue learning <ArrowRight className="size-4" />
            </Button>
        </Link>
    ) : (
        <Button
            variant="secondary"
            size={size}
            onClick={() => login()}
            loading={isLoggingIn}
            icon={!isLoggingIn ? <GoogleIcon /> : undefined}
            className="!bg-white !text-zinc-900 !border-white shadow-xl shadow-black/10 hover:!bg-zinc-50"
        >
            {isLoggingIn ? 'Signing in…' : 'Continue with Google'}
        </Button>
    );

    return (
        <div className="relative min-h-dvh overflow-x-hidden bg-bg">
            <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-[120vh]" />
            <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[90vh]" />

            {/* ── Nav ── */}
            <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-bg/60 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Logo to="/" />
                    <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
                        <a href="#features" className="transition hover:text-ink">Features</a>
                        <a href="#how" className="transition hover:text-ink">How it works</a>
                        <a href="#topics" className="transition hover:text-ink">Topics</a>
                    </nav>
                    <div className="flex items-center gap-2">
                        <button onClick={toggle} className="flex size-9 items-center justify-center rounded-xl text-subtle transition hover:bg-sunken hover:text-ink" title="Toggle theme">
                            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                        </button>
                        {signedIn ? (
                            <>
                                <Link to="/home"><Button variant="primary" size="sm">Dashboard <ArrowRight className="size-3.5" /></Button></Link>
                                <button onClick={signOut} title="Sign out" className="rounded-full"><Avatar src={profile?.picture} name={profile?.name} size={32} /></button>
                            </>
                        ) : (
                            <Button variant="secondary" size="sm" onClick={() => login()} loading={isLoggingIn} icon={!isLoggingIn ? <GoogleIcon /> : undefined}>
                                Sign in
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            <main className="relative">
                {/* ── Hero ── */}
                <section className="mx-auto max-w-7xl px-4 pb-20 pt-32 text-center sm:px-6 sm:pt-40 lg:px-8">
                    <motion.div initial="hidden" animate="show" variants={fadeUp} custom={0}>
                        <a href="#features" className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pl-1 pr-3 text-xs font-medium text-muted backdrop-blur transition hover:border-brand-500/40">
                            <span className="rounded-full bg-gradient-to-r from-brand-500 to-cyan-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">New</span>
                            Cognify 2.0 — redesigned from the ground up
                            <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
                        </a>
                    </motion.div>

                    <motion.h1
                        initial="hidden" animate="show" variants={fadeUp} custom={1}
                        className="mx-auto mt-7 max-w-4xl text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl lg:text-7xl"
                    >
                        Learn anything with an{' '}
                        <span className="font-serif text-[1.08em] font-normal italic tracking-normal text-gradient">AI&nbsp;brain</span>
                        <br className="hidden sm:block" /> built around yours.
                    </motion.h1>

                    <motion.p initial="hidden" animate="show" variants={fadeUp} custom={2} className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg">
                        {signedIn
                            ? `Welcome back, ${firstName(profile?.name)}. Your roadmaps, chats and notes are right where you left them.`
                            : 'Cognify turns any topic into a step-by-step path, then teaches it — lessons, quizzes, a code sandbox and a tutor that remembers what you’ve learned.'}
                    </motion.p>

                    <motion.div initial="hidden" animate="show" variants={fadeUp} custom={3} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <PrimaryCTA />
                        {!signedIn && (
                            <a href="#features">
                                <Button variant="ghost" size="lg">See what’s inside <ArrowRight className="size-4" /></Button>
                            </a>
                        )}
                    </motion.div>
                    {loginError && <p role="alert" className="mt-4 text-sm text-red-500">{loginError}</p>}

                    <motion.div initial="hidden" animate="show" variants={fadeUp} custom={4} className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-subtle">
                        {['Free to use', 'Progress syncs across devices', 'No setup — sign in and go'].map((t) => (
                            <span key={t} className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-500" />{t}</span>
                        ))}
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="mt-16 sm:mt-20">
                        <HeroPreview />
                    </motion.div>
                </section>

                {/* ── Topic marquee ── */}
                <section id="topics" className="relative border-y border-line bg-surface/40 py-6">
                    <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
                        <motion.div
                            className="flex w-max gap-3"
                            animate={{ x: ['0%', '-50%'] }}
                            transition={{ duration: 40, ease: 'linear', repeat: Infinity }}
                        >
                            {[...TOPICS, ...TOPICS].map((t, i) => (
                                <span key={i} className="whitespace-nowrap rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-muted">{t}</span>
                            ))}
                        </motion.div>
                    </div>
                </section>

                {/* ── Features bento ── */}
                <section id="features" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
                    <div className="mx-auto max-w-2xl text-center">
                        <div className="eyebrow text-brand-500">Everything in one place</div>
                        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
                            A whole study stack, <span className="font-serif font-normal italic text-gradient">not another tab.</span>
                        </h2>
                        <p className="mt-4 text-muted">Six tools that share one memory of you — so the tutor knows your roadmap, and your notes know your lessons.</p>
                    </div>
                    <motion.div
                        className="mt-14 grid gap-4 md:grid-cols-3"
                        initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.05 }}
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
                    >
                        {FEATURES.map((f) => (
                            <motion.div
                                key={f.title}
                                variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } }}
                                className={`card card-hover group relative overflow-hidden p-7 ${f.span}`}
                            >
                                <div className={`absolute -right-10 -top-10 size-40 rounded-full bg-gradient-to-br ${f.gradient} opacity-10 blur-2xl transition-opacity duration-500 group-hover:opacity-25`} />
                                <div className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.gradient} text-white shadow-lg`}>
                                    <f.icon className="size-5" />
                                </div>
                                <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                            </motion.div>
                        ))}
                    </motion.div>
                </section>

                {/* ── How it works ── */}
                <section id="how" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 sm:pb-32 lg:px-8">
                    <div className="card relative overflow-hidden p-8 sm:p-12">
                        <div className="aurora absolute inset-0 opacity-60" />
                        <div className="relative grid gap-10 md:grid-cols-3">
                            {[
                                { n: '01', t: 'Pick a topic', b: 'Anything from “Rust ownership” to “Calculus II”. Or choose a preset to start in one click.' },
                                { n: '02', t: 'Follow the path', b: 'Each level unlocks the next. Read the lesson, dig into sub-modules, ask the tutor, run code.' },
                                { n: '03', t: 'Prove it', b: 'Pass the quiz to earn XP, keep your streak alive and climb the leaderboard.' },
                            ].map((s) => (
                                <div key={s.n}>
                                    <div className="font-mono text-sm text-brand-500">{s.n}</div>
                                    <h3 className="mt-3 text-xl font-semibold tracking-tight">{s.t}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-muted">{s.b}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Final CTA ── */}
                <section className="mx-auto max-w-4xl px-4 pb-28 text-center sm:px-6">
                    <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
                        Your next skill is <span className="font-serif font-normal italic text-gradient">one topic away.</span>
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-muted">Sign in with Google and Cognify builds your first roadmap in seconds.</p>
                    <div className="mt-8 flex justify-center"><PrimaryCTA /></div>
                </section>
            </main>

            <footer className="relative border-t border-line py-10">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-subtle sm:flex-row sm:px-6 lg:px-8">
                    <Logo to="/" />
                    <p>© {new Date().getFullYear()} Cognify. Learn something today.</p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
