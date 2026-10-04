import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import RoadmapView from './components/RoadmapView';
import PlaygroundView from './components/PlaygroundView';
import ChatbotView from './components/ChatbotView';
import LeaderboardView from './components/LeaderboardView';
import NotesView from './components/NotesView';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<Dashboard />}>
          <Route path="/roadmap" element={<RoadmapView />} />
          <Route path="/playground" element={<PlaygroundView />} />
          <Route path="/chatbot" element={<ChatbotView />} />
          <Route path="/leaderboard" element={<LeaderboardView />} />
          <Route path="/notes" element={<NotesView />} />
          <Route path="*" element={<Navigate to="/roadmap" />} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
