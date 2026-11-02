import React from 'react';
import { Link } from 'react-router-dom';
import { hasSession } from '../services/apiService';
import { Button } from '../ui';
import Logo from '../shell/Logo';

const NotFound: React.FC = () => (
    <div className="flex min-h-dvh flex-col bg-bg">
        <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4"><Logo to="/" /></header>
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="font-display text-8xl font-extrabold text-brand-500">404</div>
            <h1 className="text-3xl font-extrabold">This page wandered off the path</h1>
            <p className="max-w-md text-muted">The link may be old or mistyped.</p>
            <Link to={hasSession() ? '/learn' : '/'}><Button variant="primary" size="lg" uppercase>{hasSession() ? 'Back to learning' : 'Go home'}</Button></Link>
        </main>
    </div>
);

export default NotFound;
