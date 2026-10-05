import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Landing from './pages/Landing';
import AppShell from './shell/AppShell';
import { Spinner } from './ui';
import { getCurrentUser, hasSession } from './services/apiService';
import { progressService } from './services/progressService';
import { roadmapStore } from './services/roadmapStore';
import { saveProfile } from './lib/session';

const Learn = lazy(() => import('./pages/Learn'));
const Courses = lazy(() => import('./pages/Courses'));
const Lesson = lazy(() => import('./pages/Lesson'));
const Practice = lazy(() => import('./pages/Practice'));
const Tutor = lazy(() => import('./pages/Tutor'));
const Community = lazy(() => import('./pages/Community'));
const Notes = lazy(() => import('./pages/Notes'));
const Profile = lazy(() => import('./pages/Profile'));

const Loading = () => <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="size-7" /></div>;

/**
 * Everything past the landing page needs a session. On entry, refresh the
 * account from the server: XP, streak and rewards live there, which is what
 * makes progress follow the learner across devices.
 */
function useAccountSync(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        getCurrentUser().then((u) => {
            if (cancelled) return;
            localStorage.setItem('db_user_id', String(u.id));
            saveProfile({ sub: u.google_id, name: u.name, email: u.email, picture: u.picture || undefined });
            progressService.applyServerUser(u);
            roadmapStore.load();
        }).catch((e) => console.warn('[account] refresh skipped', e));
        return () => { cancelled = true; };
    }, [enabled]);
}

const RequireAuth: React.FC<{ shell?: boolean }> = ({ shell = true }) => {
    const signedIn = hasSession();
    useAccountSync(signedIn);
    if (!signedIn) return <Navigate to="/" replace />;
    const page = <Suspense fallback={<Loading />}><Outlet /></Suspense>;
    return shell ? <AppShell>{page}</AppShell> : page;
};

/** Old v1/v2.0 URLs keep working. */
const LegacyRoadmap = () => {
    const { search } = useLocation();
    const p = new URLSearchParams(search);
    const t = p.get('learn');
    return <Navigate to={t ? `/courses?new=${encodeURIComponent(t)}` : '/courses'} replace />;
};
const LegacyChat = () => <Navigate to={`/tutor${useLocation().search}`} replace />;
const CommunityRoute = () => { const { roomId } = useParams(); return <Community key={roomId ? 'room' : 'list'} />; };

const App: React.FC = () => (
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<RequireAuth shell={false} />}>
                <Route path="/lesson/:courseId/:levelId" element={<Lesson />} />
            </Route>
            <Route element={<RequireAuth />}>
                <Route path="/learn" element={<Learn />} />
                <Route path="/courses" element={<Courses />} />
                <Route path="/practice" element={<Practice />} />
                <Route path="/tutor" element={<Tutor />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/community" element={<CommunityRoute />} />
                <Route path="/community/:roomId" element={<CommunityRoute />} />
                <Route path="/profile" element={<Profile />} />
                {/* legacy */}
                <Route path="/home" element={<Navigate to="/learn" replace />} />
                <Route path="/roadmap" element={<LegacyRoadmap />} />
                <Route path="/playground" element={<Navigate to="/practice" replace />} />
                <Route path="/chatbot" element={<LegacyChat />} />
                <Route path="/leaderboard" element={<Navigate to="/community/leaderboard" replace />} />
                <Route path="*" element={<Navigate to="/learn" replace />} />
            </Route>
        </Routes>
    </BrowserRouter>
);

export default App;
