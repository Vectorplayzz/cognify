import React from 'react';

/** Last line of defence: a render crash shows a recovery screen, not a blank page. */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
    state = { error: null as Error | null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[Cognify] UI crashed:', error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        // A stale tab after a deploy fails to load a lazy chunk: a reload fixes it.
        const chunk = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(this.state.error.message);
        return (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
                <div className="flex size-20 items-center justify-center rounded-3xl bg-amber-400 text-4xl shadow-[0_6px_0_0_#d97706]">🧩</div>
                <h1 className="text-3xl font-extrabold">{chunk ? 'Cognify was updated' : 'Something went wrong'}</h1>
                <p className="max-w-md text-muted">{chunk ? 'A newer version is available. Reload to continue where you left off.' : 'This screen hit an unexpected error. Your progress is saved — reloading usually fixes it.'}</p>
                <div className="flex gap-2">
                    <button onClick={() => window.location.reload()} className="h-12 rounded-2xl bg-brand-500 px-6 font-bold text-white shadow-[0_4px_0_0_var(--color-brand-700)] active:translate-y-1 active:shadow-none">Reload</button>
                    <a href="/learn" className="flex h-12 items-center rounded-2xl border-2 border-line bg-surface px-6 font-bold">Go to Learn</a>
                </div>
            </div>
        );
    }
}
