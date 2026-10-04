import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';

export const LogoMark: React.FC<{ className?: string }> = ({ className }) => {
    // Each instance needs its own gradient id: a shared id resolves to the
    // first copy in the DOM, which may be inside a hidden sidebar.
    const id = useId().replace(/:/g, '');
    return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden="true">
        <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#b6a3ff" />
                <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill="#0d0b1d" />
        <rect x="0.5" y="0.5" width="63" height="63" rx="17.5" fill="none" stroke={`url(#${id})`} strokeOpacity="0.45" />
        <path d="M41 20.5a14 14 0 1 0 0 23" fill="none" stroke={`url(#${id})`} strokeWidth="7" strokeLinecap="round" />
        <circle cx="44.5" cy="32" r="4.5" fill="#22d3ee" />
    </svg>
    );
};

const Logo: React.FC<{ compact?: boolean; to?: string; className?: string }> = ({ compact, to = '/home', className }) => (
    <Link to={to} className={cn('flex items-center gap-2.5', className)}>
        <LogoMark />
        {!compact && (
            <span className="text-[17px] font-semibold tracking-tight">
                Cognify<span className="ml-1 rounded-md bg-brand-500/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-brand-600 dark:text-brand-300">2.0</span>
            </span>
        )}
    </Link>
);

export default Logo;
