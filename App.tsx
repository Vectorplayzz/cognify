import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import { Spinner } from './components/ui';

// Feature views load on demand so the landing page stays light.
const HomeView = lazy(() => import('./pages/HomeView'));
const RoadmapView = lazy(() => import('./components/RoadmapView'));
const PlaygroundView = lazy(() => import('./components/PlaygroundView'));
const ChatbotView = lazy(() => import('./components/ChatbotView'));
const LeaderboardView = lazy(() => import('./components/LeaderboardView'));
const NotesView = lazy(() => import('./components/NotesView'));

const Fallback = () => (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
        <Spinner className="size-6" />
    </div>
);

const App: React.FC = () => (
    <Router>
        <Suspense fallback={<Fallback />}>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route element={<Dashboard />}>
                    <Route path="/home" element={<HomeView />} />
                    <Route path="/roadmap" element={<RoadmapView />} />
                    <Route path="/playground" element={<PlaygroundView />} />
                    <Route path="/chatbot" element={<ChatbotView />} />
                    <Route path="/leaderboard" element={<LeaderboardView />} />
                    <Route path="/notes" element={<NotesView />} />
                    <Route path="*" element={<Navigate to="/home" replace />} />
                </Route>
            </Routes>
        </Suspense>
    </Router>
);

export default App;
