import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { registerWithPassword, signInWithGoogle, signInWithPassword } from '../services/apiService';
import { saveProfile } from '../lib/session';
import { cn } from '../lib/cn';
import { Button, Modal } from '../ui';
import { LogoMark } from './Logo';

export type AuthMode = 'login' | 'signup';

export const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

const Field: React.FC<{
    icon: React.ReactNode; label: string; type?: string; value: string; onChange: (v: string) => void;
    autoComplete: string; placeholder?: string; autoFocus?: boolean; trailing?: React.ReactNode; hint?: React.ReactNode;
}> = ({ icon, label, type = 'text', value, onChange, autoComplete, placeholder, autoFocus, trailing, hint }) => (
    <label className="block">
        <span className="mb-1.5 block text-sm font-bold">{label}</span>
        <span className="relative block">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle [&_svg]:size-4">{icon}</span>
            <input
                type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
                placeholder={placeholder} autoFocus={autoFocus} required
                className={cn('input h-12 pl-10 text-[15px]', trailing && 'pr-11')}
            />
            {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
        </span>
        {hint && <span className="mt-1 block text-xs text-subtle">{hint}</span>}
    </label>
);

/** Sign in / create account: Google, or email + password. */
const AuthDialog: React.FC<{ open: boolean; mode: AuthMode; onClose: () => void; onModeChange: (m: AuthMode) => void }> = ({ open, mode, onClose, onModeChange }) => {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState<'google' | 'email' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [forgot, setForgot] = useState(false);

    useEffect(() => { setError(null); setForgot(false); }, [mode, open]);

    const finish = (user: any) => {
        saveProfile({ sub: user.google_id || '', name: user.name, email: user.email, picture: user.picture || undefined });
        onClose();
        navigate('/learn');
    };

    const google = useGoogleLogin({
        onSuccess: async (t) => {
            setBusy('google'); setError(null);
            try { finish((await signInWithGoogle(t.access_token)).user); }
            catch (e: any) { setError(e?.message || 'Google sign-in failed. Please try again.'); }
            finally { setBusy(null); }
        },
        onError: () => { setError('Google sign-in was cancelled.'); setBusy(null); },
        onNonOAuthError: () => setBusy(null),
    });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy('email'); setError(null);
        try {
            const res = mode === 'signup' ? await registerWithPassword(name, email, password) : await signInWithPassword(email, password);
            finish(res.user);
        } catch (err: any) {
            setError(err?.message || 'Something went wrong. Please try again.');
        } finally {
            setBusy(null);
        }
    };

    const signup = mode === 'signup';
    const tooShort = signup && password.length > 0 && password.length < 8;

    return (
        <Modal open={open} onClose={onClose} className="max-w-md">
            <div className="flex flex-col items-center text-center">
                <LogoMark className="size-12" />
                <h2 className="mt-4 text-2xl font-extrabold">{signup ? 'Create your account' : 'Welcome back'}</h2>
                <p className="mt-1 text-sm text-muted">{signup ? 'Free forever. Your progress syncs across devices.' : 'Sign in to pick up where you left off.'}</p>
            </div>

            <Button size="lg" className="mt-6 w-full" icon={busy === 'google' ? undefined : <GoogleIcon />} loading={busy === 'google'} disabled={!!busy && busy !== 'google'}
                onClick={() => { setBusy('google'); setError(null); google(); }}>
                Continue with Google
            </Button>

            <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-subtle"><div className="h-0.5 flex-1 bg-line" />or with email<div className="h-0.5 flex-1 bg-line" /></div>

            <form onSubmit={submit} className="space-y-3.5" noValidate>
                <AnimatePresence initial={false}>
                    {signup && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <Field icon={<User />} label="Name" value={name} onChange={setName} autoComplete="name" placeholder="Ada Lovelace" autoFocus />
                        </motion.div>
                    )}
                </AnimatePresence>
                <Field icon={<Mail />} label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="you@example.com" autoFocus={!signup} />
                <Field
                    icon={<Lock />} label="Password" type={show ? 'text' : 'password'} value={password} onChange={setPassword}
                    autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 8 characters' : 'Your password'}
                    trailing={
                        <button type="button" onClick={() => setShow((s) => !s)} className="rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                    }
                    hint={tooShort ? <span className="text-amber-600 dark:text-amber-400">{8 - password.length} more character{8 - password.length === 1 ? '' : 's'} needed</span> : undefined}
                />

                {!signup && (
                    <div className="-mt-1 text-right">
                        <button type="button" onClick={() => setForgot((f) => !f)} className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-300">Forgot password?</button>
                    </div>
                )}
                <AnimatePresence>
                    {forgot && !signup && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-sunken p-3 text-left text-xs text-muted">
                            If your Google account uses the same email, choose <b className="text-ink">Continue with Google</b> — you’ll get straight in, and can set a new password from your profile. Otherwise, contact the site admin to reset it.
                        </motion.p>
                    )}
                </AnimatePresence>

                {error && <p role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}

                <Button type="submit" variant="primary" size="lg" uppercase className="w-full" loading={busy === 'email'} disabled={!!busy && busy !== 'email'}>
                    {signup ? 'Create account' : 'Sign in'}
                </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted">
                {signup ? 'Already have an account? ' : 'New to Cognify? '}
                <button onClick={() => onModeChange(signup ? 'login' : 'signup')} className="font-bold text-brand-600 hover:underline dark:text-brand-300">
                    {signup ? 'Sign in' : 'Create an account'}
                </button>
            </p>
        </Modal>
    );
};

export default AuthDialog;
