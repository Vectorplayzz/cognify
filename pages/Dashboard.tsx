import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import Layout from '../components/Layout';
import { progressService } from '../services/progressService';
import { roadmapStore } from '../services/roadmapStore';
import { getCurrentUser, hasSession } from '../services/apiService';
import { saveProfile } from '../lib/session';

/**
 * Signed-in shell. Every feature here calls the authenticated API, so a
 * visitor without a session goes back to the landing page. On entry it
 * refreshes the account from the server: XP, streak and rewards live there,
 * which is what makes progress follow the learner across devices.
 */
const Dashboard: React.FC = () => {
    const signedIn = hasSession();

    useEffect(() => {
        if (!signedIn) return;
        let cancelled = false;
        (async () => {
            try {
                const dbUser = await getCurrentUser();
                if (cancelled) return;
                localStorage.setItem('db_user_id', String(dbUser.id));
                saveProfile({
                    sub: dbUser.google_id,
                    name: dbUser.name,
                    email: dbUser.email,
                    picture: dbUser.picture || undefined,
                });
                progressService.applyServerUser(dbUser);
                roadmapStore.load();
            } catch (err) {
                console.warn('[Dashboard] account refresh skipped:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [signedIn]);

    if (!signedIn) return <Navigate to="/" replace />;

    return (
        <Layout>
            <Outlet />
        </Layout>
    );
};

export default Dashboard;
