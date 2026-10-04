
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { googleLogout } from '@react-oauth/google';
import { User } from '../types';
import { progressService, REWARDS } from '../services/progressService';
import { clearSession } from '../services/apiService';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  activeTab: string;
}

const Layout: React.FC<LayoutProps> = ({ children, user, activeTab }) => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    googleLogout();
    clearSession();
    navigate('/');
  };

  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  const menuItems = [
    { id: 'roadmap', icon: 'fa-map', label: 'Roadmap' },
    { id: 'playground', icon: 'fa-code', label: 'Playground' },
    { id: 'chatbot', icon: 'fa-robot', label: 'Tutor AI' },
    { id: 'leaderboard', icon: 'fa-trophy', label: 'Leaderboard' },
    { id: 'notes', icon: 'fa-book', label: 'Notes' },
  ];

  const earnedRewards = progressService.getEarnedRewards();
  const nextReward = REWARDS.filter(r => r.xpThreshold > 0 && !earnedRewards.find(er => er.id === r.id))
    .sort((a, b) => a.xpThreshold - b.xpThreshold)[0];
  const nextRewardPercent = nextReward ? Math.min(100, Math.round((user.xp / nextReward.xpThreshold) * 100)) : 100;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <aside
        className={`sidebar-transition bg-slate-900 border-r border-slate-800 flex-col hidden md:flex ${sidebarOpen ? 'w-64' : 'w-[70px]'}`}
      >
        {/* Header with toggle */}
        <div className={`p-4 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {sidebarOpen && (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                <i className="fas fa-brain text-white text-xl"></i>
              </div>
               <span className="font-bold text-xl tracking-tight text-white">Cognify</span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <i className={`fas ${sidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'} text-sm`}></i>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 sidebar-scroll overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(`/${item.id}`)}
              className={`w-full flex items-center ${sidebarOpen ? 'space-x-3 px-4' : 'justify-center px-0'} py-3 rounded-lg transition-all ${activeTab === item.id
                ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <i className={`fas ${item.icon} ${sidebarOpen ? '' : 'text-lg'}`}></i>
              {sidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}

          {/* ── Useful Content Section ── */}
          {sidebarOpen && (
            <div className="mt-6 space-y-3">
              {/* Divider */}
              <div className="border-t border-white/5 pt-4">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-2">Insights</span>
              </div>

              {/* Daily Streak Card */}
              <div className="animate-fade-in-up p-3 rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/5 border border-orange-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <i className="fas fa-fire text-orange-400"></i>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Daily Streak</p>
                    <p className="text-lg font-extrabold text-orange-300">{user.streak} <span className="text-xs font-normal text-slate-500">days</span></p>
                  </div>
                </div>
              </div>

              {/* Quick Stats Card */}
              <div className="animate-fade-in-up delay-100 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Quick Stats</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400"><i className="fas fa-bolt text-yellow-500 mr-1.5"></i>Total XP</span>
                    <span className="text-xs font-bold text-indigo-300">{user.xp}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400"><i className="fas fa-layer-group text-cyan-500 mr-1.5"></i>Level</span>
                    <span className="text-xs font-bold text-cyan-300">{user.level}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400"><i className="fas fa-shield-alt text-purple-500 mr-1.5"></i>Rank</span>
                    <span className="text-xs font-bold text-purple-300">{user.rank}</span>
                  </div>
                </div>
              </div>

              {/* Next Reward Milestone */}
              {nextReward && (
                <div className="animate-fade-in-up delay-200 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Next Reward</p>
                  <div className="flex items-center gap-2 mb-2">
                    <i className={`fas ${nextReward.icon} text-indigo-400`}></i>
                    <span className="text-xs font-semibold text-slate-300">{nextReward.name}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
                      style={{ width: `${nextRewardPercent}%` }}
                    ></div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{user.xp}/{nextReward.xpThreshold} XP</p>
                </div>
              )}

              {/* Earned Badges */}
              {earnedRewards.length > 0 && (
                <div className="animate-fade-in-up delay-300 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Earned Badges</p>
                  <div className="flex flex-wrap gap-2">
                    {earnedRewards.map(r => (
                      <div
                        key={r.id}
                        className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center"
                        title={`${r.name}: ${r.description}`}
                      >
                        <i className={`fas ${r.icon} text-indigo-400 text-xs`}></i>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Collapsed state: show icons for insights */}
          {!sidebarOpen && (
            <div className="mt-6 space-y-3 flex flex-col items-center">
              <div className="border-t border-white/5 w-full pt-3"></div>
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center" title={`Streak: ${user.streak} days`}>
                <i className="fas fa-fire text-orange-400 text-sm"></i>
              </div>
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center" title={`${user.xp} XP`}>
                <i className="fas fa-bolt text-yellow-500 text-sm"></i>
              </div>
              {earnedRewards.length > 0 && (
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center" title={`${earnedRewards.length} badges earned`}>
                  <i className="fas fa-medal text-purple-400 text-sm"></i>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User Card */}
        <div className="p-3 border-t border-white/5">
          {sidebarOpen ? (
            <>
              <div className="flex items-center space-x-3 bg-white/[0.03] p-3 rounded-xl border border-white/5">
                <img
                  src={user.picture || localStorage.getItem('user_picture') || `https://picsum.photos/seed/${user.id}/40/40`}
                  className="rounded-full w-10 h-10 object-cover ring-2 ring-indigo-500/30"
                  alt="avatar"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-white">{user.name}</p>
                  <p className="text-xs text-slate-400">Level {user.level} {user.rank}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="group w-full mt-3 px-3 py-2.5 bg-white/[0.03] hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl transition-all duration-300 text-sm font-medium border border-white/5 hover:border-red-500/20 flex items-center justify-center gap-2"
              >
                <i className="fas fa-sign-out-alt group-hover:translate-x-0.5 transition-transform duration-300"></i>
                Sign Out
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              {console.log('[Layout] Rendering collapsed avatar, picture:', user.picture, 'localStorage:', localStorage.getItem('user_picture'))}
              <img
                src={user.picture || localStorage.getItem('user_picture') || `https://picsum.photos/seed/${user.id}/40/40`}
                className="rounded-full w-9 h-9 object-cover ring-2 ring-indigo-500/30"
                alt="avatar"
                title={user.name}
              />
              <button
                onClick={handleLogout}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Sign Out"
              >
                <i className="fas fa-sign-out-alt text-sm"></i>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between z-10">
          <div className="flex items-center space-x-4">
            <button onClick={toggleSidebar} className="md:hidden text-slate-400 hover:text-white transition-colors">
              <i className="fas fa-bars"></i>
            </button>
            {/* Collapsed: show logo in header */}
            {!sidebarOpen && (
              <div className="hidden md:flex items-center space-x-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <i className="fas fa-brain text-white text-sm"></i>
                </div>
                 <span className="font-bold text-lg text-white">Cognify</span>
              </div>
            )}
            <h2 className="text-lg font-semibold text-white capitalize">{activeTab}</h2>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2 bg-indigo-900/20 px-3 py-1 rounded-full border border-indigo-500/30">
              <i className="fas fa-bolt text-yellow-500"></i>
              <span className="text-sm font-bold text-indigo-300">{user.xp} XP</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300">
              <i className="fas fa-fire text-orange-500"></i>
              <span className="text-sm font-bold">{user.streak} Days</span>
            </div>
            <button className="text-slate-400 hover:text-white transition-colors">
              <i className="fas fa-bell"></i>
            </button>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition-colors" title="Sign Out">
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
