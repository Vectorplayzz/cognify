import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';

/** Cognify's mark: a "C" that is also an orbit, with a spark. */
export const LogoMark: React.FC<{ className?: string }> = ({ className }) => {
    const id = useId().replace(/:/g, '');
    return (
        <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden="true">
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#8a78ff" />
                    <stop offset="1" stopColor="#5a41f0" />
                </linearGradient>
            </defs>
            <rect width="64" height="64" rx="18" fill={`url(#${id})`} />
            <rect x="4" y="54" width="56" height="6" rx="3" fill="#000" opacity="0.12" />
            <path d="M41 21a14 14 0 1 0 0 22" fill="none" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" />
            <circle cx="45" cy="32" r="5" fill="#9be15d" />
        </svg>
    );
};

const Logo: React.FC<{ compact?: boolean; to?: string; className?: string }> = ({ compact, to = '/learn', className }) => (
    <Link to={to} className={cn('flex items-center gap-2', className)}>
        <LogoMark />
        {!compact && <span className="font-display text-[22px] font-extrabold tracking-tight text-brand-600 dark:text-brand-300">cognify</span>}
    </Link>
);

export default Logo;
