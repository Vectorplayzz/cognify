/** Small formatting helpers shared by views. */

export function timeAgo(input: string | number | Date): string {
    const date = new Date(input);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (!Number.isFinite(diff)) return '';
    if (diff < 45) return 'just now';
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function greeting(): string {
    const h = new Date().getHours();
    if (h < 5) return 'Burning the midnight oil';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
}

export function firstName(name?: string | null): string {
    return (name || '').trim().split(/\s+/)[0] || 'there';
}

export function initials(name?: string | null): string {
    const parts = (name || '?').trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
