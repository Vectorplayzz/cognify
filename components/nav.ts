import { useNavigate } from 'react-router-dom';
import { googleLogout } from '@react-oauth/google';
import { Bot, Code2, Home, Map, NotebookPen, Trophy } from 'lucide-react';
import { clearSession } from '../services/apiService';
import { roadmapStore } from '../services/roadmapStore';

export const NAV_ITEMS = [
    { to: '/home', label: 'Home', icon: Home, description: 'Your learning overview' },
    { to: '/roadmap', label: 'Roadmaps', icon: Map, description: 'Learning paths and lessons' },
    { to: '/playground', label: 'Playground', icon: Code2, description: 'Write and run code' },
    { to: '/chatbot', label: 'AI Tutor', icon: Bot, description: 'Chat and study rooms' },
    { to: '/notes', label: 'Notes', icon: NotebookPen, description: 'Study notes from your sources' },
    { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, description: 'Ranks and rewards' },
] as const;

export function useSignOut() {
    const navigate = useNavigate();
    return () => {
        googleLogout();
        clearSession();
        roadmapStore.reset();
        navigate('/');
    };
}
