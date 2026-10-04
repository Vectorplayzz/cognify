import React, { useEffect, useId } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { initials } from '../../lib/format';

// ── Button ──────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const buttonVariants: Record<ButtonVariant, string> = {
    primary:
        'text-white bg-gradient-to-b from-brand-500 to-brand-600 shadow-[0_1px_0_0_rgb(255_255_255/0.2)_inset,0_8px_24px_-8px_rgb(124_92_255/0.6)] hover:from-brand-400 hover:to-brand-600 active:translate-y-px',
    secondary: 'bg-elevated text-ink border border-line hover:border-line-strong hover:bg-sunken',
    outline: 'border border-line-strong text-ink hover:bg-sunken',
    ghost: 'text-muted hover:text-ink hover:bg-sunken',
    danger: 'text-white bg-red-500/90 hover:bg-red-500 shadow-[0_8px_24px_-10px_rgb(239_68_68/0.7)]',
    success: 'text-white bg-emerald-500 hover:bg-emerald-400 shadow-[0_8px_24px_-10px_rgb(16_185_129/0.7)]',
};
const buttonSizes: Record<ButtonSize, string> = {
    xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
    md: 'h-10 px-4 text-sm gap-2 rounded-xl',
    lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
    icon: 'h-10 w-10 rounded-xl',
    'icon-sm': 'h-8 w-8 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...props }, ref) => (
        <button
            ref={ref}
            disabled={disabled || loading}
            className={cn(
                'inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap transition-all duration-200 disabled:pointer-events-none disabled:opacity-45',
                buttonVariants[variant],
                buttonSizes[size],
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
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }> = ({ className, hover, ...props }) => (
    <div className={cn('card', hover && 'card-hover', className)} {...props} />
);

// ── Badge ───────────────────────────────────────────
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
const tones: Record<Tone, string> = {
    neutral: 'bg-sunken text-muted border-line',
    brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300 border-brand-500/20',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20',
    danger: 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20',
    info: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20',
};
export const Badge: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode; icon?: React.ReactNode }> = ({
    tone = 'neutral', className, children, icon,
}) => (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>
        {icon}
        {children}
    </span>
);

// ── Spinner ─────────────────────────────────────────
export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
    <Loader2 className={cn('size-5 animate-spin text-brand-400', className)} />
);

// ── Avatar ──────────────────────────────────────────
export const Avatar: React.FC<{ src?: string | null; name?: string | null; size?: number; className?: string }> = ({
    src, name, size = 36, className,
}) => {
    const [failed, setFailed] = React.useState(false);
    const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
    if (src && !failed) {
        return (
            <img
                src={src}
                alt={name || 'avatar'}
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
                className={cn('shrink-0 rounded-full object-cover ring-1 ring-line-strong', className)}
                style={style}
            />
        );
    }
    return (
        <div
            className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-cyan-500 font-semibold text-white', className)}
            style={style}
        >
            {initials(name)}
        </div>
    );
};

// ── Progress ring ───────────────────────────────────
export const ProgressRing: React.FC<{ value: number; size?: number; stroke?: number; children?: React.ReactNode; className?: string }> = ({
    value, size = 120, stroke = 10, children, className,
}) => {
    const id = useId();
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-line)" strokeWidth={stroke} />
                <motion.circle
                    cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c}
                    initial={{ strokeDashoffset: c }}
                    animate={{ strokeDashoffset: c - (pct / 100) * c }}
                    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                />
                <defs>
                    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#9a7dff" />
                        <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
        </div>
    );
};

// ── Progress bar ────────────────────────────────────
export const ProgressBar: React.FC<{ value: number; className?: string; tone?: 'brand' | 'success' }> = ({ value, className, tone = 'brand' }) => (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}>
        <motion.div
            className={cn('h-full rounded-full', tone === 'success' ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-500 to-cyan-400')}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
    </div>
);

// ── Icon tile ───────────────────────────────────────
export const IconTile: React.FC<{ children: React.ReactNode; className?: string; gradient?: string; size?: 'sm' | 'md' | 'lg' }> = ({
    children, className, gradient = 'from-brand-500 to-cyan-500', size = 'md',
}) => (
    <div
        className={cn(
            'flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-lg shadow-black/10',
            size === 'sm' && 'size-8 rounded-lg [&_svg]:size-4',
            size === 'md' && 'size-10 rounded-xl [&_svg]:size-5',
            size === 'lg' && 'size-12 rounded-2xl [&_svg]:size-6',
            gradient,
            className,
        )}
    >
        {children}
    </div>
);

// ── Empty state ─────────────────────────────────────
export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
    icon, title, description, action, className,
}) => (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center', className)}>
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-sunken text-subtle [&_svg]:size-6">{icon}</div>
        <p className="font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
        {action && <div className="mt-5">{action}</div>}
    </div>
);

// ── Segmented control ───────────────────────────────
export function Segmented<T extends string>({
    value, onChange, options, className, size = 'md',
}: {
    value: T;
    onChange: (v: T) => void;
    options: { value: NoInfer<T>; label: React.ReactNode; icon?: React.ReactNode }[];
    className?: string;
    size?: 'sm' | 'md';
}) {
    const group = useId();
    return (
        <div className={cn('inline-flex items-center gap-1 rounded-xl border border-line bg-sunken/70 p-1', className)}>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            'relative inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors',
                            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
                            active ? 'text-ink' : 'text-subtle hover:text-muted',
                        )}
                    >
                        {active && (
                            <motion.span
                                layoutId={`seg-${group}`}
                                className="absolute inset-0 rounded-lg border border-line bg-elevated shadow-sm"
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                            />
                        )}
                        <span className="relative z-10 inline-flex items-center gap-1.5 [&_svg]:size-3.5">
                            {o.icon}
                            {o.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ── Modal ───────────────────────────────────────────
export const Modal: React.FC<{
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}> = ({ open, onClose, title, description, children, className }) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        className={cn('card relative w-full max-w-lg rounded-b-none bg-elevated p-6 sm:rounded-2xl', className)}
                        initial={{ y: 24, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 16, opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    >
                        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-subtle transition hover:bg-sunken hover:text-ink" aria-label="Close">
                            <X className="size-4" />
                        </button>
                        {title && <h3 className="pr-8 text-lg font-semibold tracking-tight">{title}</h3>}
                        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                        <div className={cn(title || description ? 'mt-5' : '')}>{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// ── Kbd ─────────────────────────────────────────────
export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-sunken px-1 font-mono text-[10px] font-medium text-subtle', className)}>
        {children}
    </kbd>
);

// ── Page header ─────────────────────────────────────
export const PageHeader: React.FC<{ eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }> = ({
    eyebrow, title, description, actions, className,
}) => (
    <div className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
        <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            {description && <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

// ── Stagger helpers for motion lists ────────────────
export const stagger = {
    container: { hidden: {}, show: { transition: { staggerChildren: 0.05 } } },
    item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } },
} as const;
