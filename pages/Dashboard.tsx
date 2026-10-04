import React, { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { User } from '../types';
import { progressService } from '../services/progressService';
import { getCurrentUser, hasSession } from '../services/apiService';

const Dashboard: React.FC = () => {
  const location = useLocation();
  // Every dashboard feature calls the authenticated API, so there is nothing
  // useful to show without a session.
  const signedIn = hasSession();

  // Derive activeTab from URL path (e.g. /roadmap -> roadmap)
  const activeTab = location.pathname.split('/')[1] || 'roadmap';

  // Build user from Google OAuth data + real progress
  const [user, setUser] = useState<User>(() => {
    const storedUser = localStorage.getItem('user');
    const realXp = progressService.getTotalXp();
    const realLevel = progressService.getLevel();
    const realRank = progressService.getRank();

    // Try to get picture directly from localStorage as fallback
    const storedPicture = localStorage.getItem('user_picture');

    const baseUser: User = {
      id: '',
      name: 'Learner',
      email: '',
      xp: realXp,
      level: realLevel,
      streak: 0,
      rank: realRank,
      picture: undefined
    };

    if (storedUser) {
      try {
        const googleUser = JSON.parse(storedUser);
        // Use picture from Google user, or fallback to stored picture
        const picture = googleUser.picture || storedPicture;
        return {
          ...baseUser,
          id: googleUser.sub || baseUser.id,
          name: googleUser.name || baseUser.name,
          email: googleUser.email || baseUser.email,
          picture: picture
        };
      } catch (e) {
        console.error("Failed to parse user from local storage", e);
        return baseUser;
      }
    }
    return baseUser;
  });

  // Sync user to PostgreSQL on mount
  useEffect(() => {
    // console.log('[Dashboard] useEffect syncUser firing');
    const syncUser = async () => {
      try {
        if (!signedIn) return;
        const storedUser = localStorage.getItem('user');
        const googleUser = storedUser ? JSON.parse(storedUser) : {};

        // The account itself comes from the session, not from local storage.
        const dbUser = await getCurrentUser();

        // Store the DB user ID and picture for other services to use
        localStorage.setItem('db_user_id', String(dbUser.id));
        if (googleUser.picture) {
          localStorage.setItem('user_picture', googleUser.picture);
          // console.log('[Dashboard] syncUser - saved picture to localStorage:', googleUser.picture);
        }

        // Update user state with DB data if it has more XP, but preserve picture from Google
        if (dbUser.xp > (user.xp || 0)) {
          setUser(prev => ({
            ...prev,
            xp: dbUser.xp,
            level: Math.floor(dbUser.xp / 200) + 1,
            streak: dbUser.streak || prev.streak,
            // Always prefer Google profile picture if available
            picture: googleUser.picture || dbUser.picture || prev.picture
          }));
        } else {
          // Still ensure picture is set from Google
          if (googleUser.picture) {
            localStorage.setItem('user_picture', googleUser.picture);
          }
          setUser(prev => ({
            ...prev,
            picture: googleUser.picture || prev.picture
          }));
        }
      } catch (err) {
        console.warn('[Dashboard] DB sync skipped:', err);
      }
    };
    syncUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch for localStorage changes (handles OAuth login after component mounted)
  useEffect(() => {
    // console.log('[Dashboard] useEffect checkForUserUpdate firing');
    const checkForUserUpdate = () => {
      const storedUser = localStorage.getItem('user');
      const storedPicture = localStorage.getItem('user_picture');

      // console.log('[Dashboard] checkForUserUpdate - storedUser exists:', !!storedUser, 'storedPicture:', storedPicture);

      if (storedUser) {
        try {
          const googleUser = JSON.parse(storedUser);
          // console.log('[Dashboard] checkForUserUpdate - googleUser picture:', googleUser.picture);
          const picture = googleUser.picture || storedPicture;
          // console.log('[Dashboard] checkForUserUpdate - evaluation:', { picture, userPicture: user.picture, condition: !!(picture && picture !== user.picture) });

          // Update state if we have a picture and it's different
          if (picture && picture !== user.picture) {
            // console.log('[Dashboard] checkForUserUpdate - updating user with picture:', picture);
            setUser(prev => ({
              ...prev,
              id: googleUser.sub || prev.id,
              name: googleUser.name || prev.name,
              email: googleUser.email || prev.email,
              picture: picture
            }));
          } else {
            // console.log('[Dashboard] checkForUserUpdate - NOT updating. picture:', picture, 'user.picture:', user.picture);
          }
        } catch (e) {
          console.error('[Dashboard] Failed to parse user from localStorage', e);
        }
      }
    };

    // Check immediately on mount
    checkForUserUpdate();

    // Also check periodically (in case of navigation from OAuth)
    const interval = setInterval(checkForUserUpdate, 1000);
    return () => clearInterval(interval);
  }, [user.picture]);

  // Refresh user XP on re-render by reading from progressService
  const currentXp = progressService.getTotalXp();
  const currentLevel = progressService.getLevel();
  const displayUser = { ...user, xp: currentXp, level: currentLevel, rank: progressService.getRank() };

  if (!signedIn) return <Navigate to="/" replace />;

  return (
    <Layout key={user.picture || 'no-picture'} user={displayUser} activeTab={activeTab}>
      <Outlet />
    </Layout>
  );
};

export default Dashboard;
