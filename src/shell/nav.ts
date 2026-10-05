import { useNavigate } from 'react-router-dom';
import { googleLogout } from '@react-oauth/google';
import { Bot, Code2, Library, NotebookPen, Route, Users } from 'lucide-react';
import { clearSession } from '../services/apiService';
import { roadmapStore } from '../services/roadmapStore';

export const NAV = [
    { to: '/learn', label: 'Learn', icon: Route, hint: 'Your learning path' },
    { to: '/courses', label: 'Courses', icon: Library, hint: 'Browse and create courses' },
    { to: '/practice', label: 'Practice', icon: Code2, hint: 'Code workspace' },
    { to: '/tutor', label: 'Tutor', icon: Bot, hint: 'Chat with your AI tutor' },
    { to: '/notes', label: 'Notes', icon: NotebookPen, hint: 'Notes from your sources' },
    { to: '/community', label: 'Community', icon: Users, hint: 'Study rooms and leagues' },
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
