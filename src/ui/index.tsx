import React, { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { initials } from '../lib/format';

// ── Button: chunky, pressable ───────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'dark' | 'soft';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon' | 'icon-sm';

const variants: Record<ButtonVariant, string> = {
    primary: 'bg-brand-500 text-white shadow-[0_4px_0_0_var(--color-brand-700)] hover:bg-brand-400 active:shadow-none active:translate-y-[4px]',
    success: 'bg-emerald-500 text-white shadow-[0_4px_0_0_#047857] hover:bg-emerald-400 active:shadow-none active:translate-y-[4px]',
    danger: 'bg-coral text-white shadow-[0_4px_0_0_#c2410c] hover:brightness-105 active:shadow-none active:translate-y-[4px]',
    dark: 'bg-ink text-bg shadow-[0_4px_0_0_rgb(0_0_0/0.35)] hover:opacity-90 active:shadow-none active:translate-y-[4px]',
    secondary: 'bg-surface text-ink border-2 border-line shadow-[0_3px_0_0_var(--c-line)] hover:bg-sunken active:shadow-none active:translate-y-[3px]',
    soft: 'bg-brand-500/10 text-brand-700 hover:bg-brand-500/15 dark:text-brand-300',
    ghost: 'text-muted hover:bg-sunken hover:text-ink',
};
const sizes: Record<ButtonSize, string> = {
    xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
    sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-xl',
    md: 'h-11 px-5 text-sm gap-2 rounded-xl',
    lg: 'h-12 px-6 text-[15px] gap-2 rounded-2xl',
    xl: 'h-14 px-8 text-base gap-2.5 rounded-2xl',
    icon: 'size-10 rounded-xl',
    'icon-sm': 'size-8 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
    uppercase?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'secondary', size = 'md', loading, icon, uppercase, className, children, disabled, ...props }, ref) => (
        <button
            ref={ref}
            disabled={disabled || loading}
            className={cn(
                'inline-flex shrink-0 select-none items-center justify-center font-bold whitespace-nowrap transition-[background,transform,box-shadow,opacity] duration-100',
                'disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
                uppercase && 'uppercase tracking-wider',
                variants[variant],
                sizes[size],
                className,
            )}
            {...props}
        >
            {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
            {children}
        </button>
    ),
);
Button.displayName = 'Button';

// ── Card ────────────────────────────────────────────
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { press?: boolean }> = ({ className, press, ...props }) => (
    <div className={cn('panel', press && 'panel-press', className)} {...props} />
);

// ── Badge ───────────────────────────────────────────
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'pink';
const tones: Record<Tone, string> = {
    neutral: 'bg-sunken text-muted',
    brand: 'bg-brand-500/12 text-brand-700 dark:text-brand-300',
    success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    danger: 'bg-red-500/12 text-red-700 dark:text-red-300',
    info: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    pink: 'bg-pink-500/12 text-pink-700 dark:text-pink-300',
};
export const Badge: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode; icon?: React.ReactNode }> = ({ tone = 'neutral', className, children, icon }) => (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold', tones[tone], className)}>
        {icon}
        {children}
    </span>
);

export const Spinner: React.FC<{ className?: string }> = ({ className }) => <Loader2 className={cn('size-5 animate-spin text-brand-500', className)} />;

// ── Avatar ──────────────────────────────────────────
export const Avatar: React.FC<{ src?: string | null; name?: string | null; size?: number; className?: string }> = ({ src, name, size = 36, className }) => {
    const [failed, setFailed] = useState(false);
    const style = { width: size, height: size, fontSize: Math.max(10, size * 0.4) };
    if (src && !failed) {
        return <img src={src} alt={name || 'avatar'} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn('shrink-0 rounded-full object-cover', className)} style={style} />;
    }
    const hue = [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return (
        <div className={cn('flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white', className)} style={{ ...style, background: `hsl(${hue} 70% 55%)` }}>
            {initials(name)}
        </div>
    );
};

// ── Progress ────────────────────────────────────────
export const ProgressBar: React.FC<{ value: number; className?: string; tone?: 'brand' | 'success' | 'amber'; size?: 'sm' | 'md' | 'lg' }> = ({ value, className, tone = 'brand', size = 'md' }) => (
    <div className={cn('w-full overflow-hidden rounded-full bg-sunken', size === 'sm' ? 'h-2' : size === 'lg' ? 'h-4' : 'h-3', className)}>
        <motion.div
            className={cn('relative h-full rounded-full', tone === 'success' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-400' : 'bg-brand-500')}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
            {size !== 'sm' && <span className="absolute inset-x-2 top-[3px] h-[3px] rounded-full bg-white/30" />}
        </motion.div>
    </div>
);

export const ProgressRing: React.FC<{ value: number; size?: number; stroke?: number; children?: React.ReactNode; className?: string; color?: string }> = ({
    value, size = 120, stroke = 10, children, className, color = 'var(--color-brand-500)',
}) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-sunken)" strokeWidth={stroke} />
                <motion.circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (pct / 100) * c }}
                    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
        </div>
    );
};

// ── Empty state ─────────────────────────────────────
export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ icon, title, description, action, className }) => (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
        <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-500/10 text-brand-500 [&_svg]:size-7">{icon}</div>
        <p className="font-display text-lg font-bold">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
        {action && <div className="mt-6">{action}</div>}
    </div>
);

// ── Tabs (underline) ────────────────────────────────
export function Tabs<T extends string>({ value, onChange, options, className }: {
    value: T; onChange: (v: T) => void; className?: string;
    options: { value: NoInfer<T>; label: React.ReactNode; icon?: React.ReactNode; count?: number }[];
}) {
    const group = useId();
    return (
        <div className={cn('flex items-center gap-1 border-b-2 border-line', className)}>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button key={o.value} onClick={() => onChange(o.value)}
                        className={cn('relative -mb-[2px] flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold transition-colors [&_svg]:size-4', active ? 'text-brand-600 dark:text-brand-300' : 'text-subtle hover:text-muted')}>
                        {o.icon}{o.label}
                        {o.count != null && <span className="rounded-full bg-sunken px-1.5 text-[10px] text-muted">{o.count}</span>}
                        {active && <motion.span layoutId={`tab-${group}`} className="absolute inset-x-1 -bottom-0 h-[3px] rounded-full bg-brand-500" />}
                    </button>
                );
            })}
        </div>
    );
}

// ── Segmented (pill) ────────────────────────────────
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: {
    value: T; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md';
    options: { value: NoInfer<T>; label: React.ReactNode; icon?: React.ReactNode }[];
}) {
    const group = useId();
    return (
        <div className={cn('inline-flex items-center gap-1 rounded-xl bg-sunken p-1', className)}>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button key={o.value} onClick={() => onChange(o.value)}
                        className={cn('relative inline-flex items-center justify-center gap-1.5 rounded-lg font-bold transition-colors', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm', active ? 'text-ink' : 'text-subtle hover:text-muted')}>
                        {active && <motion.span layoutId={`seg-${group}`} className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
                        <span className="relative z-10 inline-flex items-center gap-1.5 [&_svg]:size-3.5">{o.icon}{o.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

// ── Modal ───────────────────────────────────────────
export const Modal: React.FC<{ open: boolean; onClose: () => void; title?: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
    open, onClose, title, description, children, className,
}) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] dark:bg-black/60" onClick={onClose} />
                    <motion.div role="dialog" aria-modal="true"
                        className={cn('panel relative w-full max-w-lg rounded-b-none p-6 sm:rounded-3xl', className)}
                        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}>
                        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-ink" aria-label="Close"><X className="size-5" /></button>
                        {title && <h3 className="pr-8 text-xl font-bold">{title}</h3>}
                        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                        <div className={cn(title || description ? 'mt-5' : '')}>{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// ── Drawer (side sheet) ─────────────────────────────
export const Drawer: React.FC<{ open: boolean; onClose: () => void; side?: 'left' | 'right'; children: React.ReactNode; className?: string }> = ({ open, onClose, side = 'left', children, className }) => (
    <AnimatePresence>
        {open && (
            <motion.div className="fixed inset-0 z-[70]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={onClose} />
                <motion.div
                    className={cn('absolute inset-y-0 w-[88%] max-w-sm overflow-y-auto border-line bg-surface', side === 'left' ? 'left-0 border-r-2' : 'right-0 border-l-2', className)}
                    initial={{ x: side === 'left' ? '-100%' : '100%' }} animate={{ x: 0 }} exit={{ x: side === 'left' ? '-100%' : '100%' }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.3 }}>
                    {children}
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-md border-2 border-line bg-surface px-1 font-mono text-[10px] font-bold text-subtle', className)}>{children}</kbd>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ children, action, className }) => (
    <div className={cn('mb-3 flex items-center justify-between gap-2', className)}>
        <h2 className="text-lg font-bold">{children}</h2>
        {action}
    </div>
);

export const stagger = {
    container: { hidden: {}, show: { transition: { staggerChildren: 0.05 } } },
    item: { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } },
} as const;
