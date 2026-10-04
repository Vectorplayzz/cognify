import React from 'react';
import { progressService, REWARDS } from '../services/progressService';

const LeaderboardView: React.FC = () => {
  const progress = progressService.getProgress();
  const earnedRewards = progressService.getEarnedRewards();
  const totalXp = progressService.getTotalXp();
  const level = progressService.getLevel();
  const rank = progressService.getRank();

  // Build user entry from localStorage
  const storedUser = (() => {
    try {
      const u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  })();

  const userName = storedUser?.name || 'You';
  const userPicture = storedUser?.picture || `https://picsum.photos/seed/user/80/80`;

  // Show all roadmap stats
  const totalLevelsCompleted = progress.roadmaps.reduce((acc, r) => acc + r.completedLevels.length, 0);
  const totalQuizzesTaken = progress.roadmaps.reduce((acc, r) => acc + r.quizResults.length, 0);
  const avgQuizScore = (() => {
    const allResults = progress.roadmaps.flatMap(r => r.quizResults);
    if (allResults.length === 0) return 0;
    const totalPercent = allResults.reduce((acc, r) => acc + (r.score / r.total) * 100, 0);
    return Math.round(totalPercent / allResults.length);
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      {/* Profile Stats */}
      <div className="p-8 rounded-2xl bg-gradient-to-br from-indigo-900/30 to-purple-900/20 border border-indigo-500/20 shadow-xl shadow-indigo-500/5">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <img
            src={userPicture}
            className="w-24 h-24 rounded-2xl border-4 border-indigo-500/30 shadow-lg"
            alt="avatar"
          />
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-2xl font-extrabold text-white mb-1">{userName}</h2>
            <p className="text-indigo-400 font-bold text-sm uppercase tracking-wider">{rank} • Level {level}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <StatCard icon="fa-bolt" color="text-yellow-500" value={totalXp.toLocaleString()} label="Total XP" />
            <StatCard icon="fa-layer-group" color="text-indigo-400" value={String(totalLevelsCompleted)} label="Levels Done" />
            <StatCard icon="fa-question-circle" color="text-purple-400" value={String(totalQuizzesTaken)} label="Quizzes" />
            <StatCard icon="fa-bullseye" color="text-emerald-400" value={`${avgQuizScore}%`} label="Avg Score" />
          </div>
        </div>
      </div>

      {/* Rewards Section */}
      <div>
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
          <i className="fas fa-trophy mr-2 text-yellow-500"></i>Rewards & Milestones
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {REWARDS.map((reward) => {
            const isEarned = earnedRewards.some(r => r.id === reward.id);
            return (
              <div
                key={reward.id}
                className={`p-4 rounded-2xl border text-center transition-all ${isEarned
                    ? 'bg-yellow-500/5 border-yellow-500/20 shadow-lg shadow-yellow-500/5'
                    : 'bg-slate-900/50 border-slate-800 opacity-40'
                  }`}
              >
                <div className={`w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center ${isEarned ? 'bg-yellow-500/20' : 'bg-slate-800'
                  }`}>
                  <i className={`fas ${reward.icon} text-lg ${isEarned ? 'text-yellow-400' : 'text-slate-600'}`}></i>
                </div>
                <p className={`text-xs font-bold ${isEarned ? 'text-white' : 'text-slate-600'}`}>{reward.name}</p>
                <p className={`text-[10px] mt-1 ${isEarned ? 'text-slate-400' : 'text-slate-700'}`}>{reward.description}</p>
                {isEarned && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                    <i className="fas fa-check mr-1"></i>Earned
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Roadmap Progress */}
      {progress.roadmaps.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
            <i className="fas fa-map mr-2 text-indigo-400"></i>Roadmap Progress
          </h3>
          <div className="space-y-3">
            {progress.roadmaps.map((rp) => {
              const quizCount = rp.quizResults.length;
              const avgScore = quizCount > 0
                ? Math.round(rp.quizResults.reduce((a, q) => a + (q.score / q.total) * 100, 0) / quizCount)
                : 0;
              return (
                <div key={rp.roadmapId} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">{rp.topic}</span>
                    <div className="flex items-center gap-3">
                      {quizCount > 0 && (
                        <span className="text-[10px] text-slate-400">Avg: {avgScore}%</span>
                      )}
                      <span className="text-xs font-bold text-indigo-400">{rp.completedLevels.length} levels</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: `${Math.min(rp.completedLevels.length * 16.7, 100)}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {progress.roadmaps.length === 0 && (
        <div className="text-center py-16">
          <i className="fas fa-rocket text-5xl text-slate-700 mb-6 block"></i>
          <h3 className="text-lg font-bold text-white mb-2">Start Your Journey!</h3>
          <p className="text-slate-400 text-sm">Complete roadmaps and quizzes to earn XP and unlock rewards.</p>
        </div>
      )}
    </div>
  );
};

// Stat Card sub-component
const StatCard: React.FC<{ icon: string; color: string; value: string; label: string }> = ({ icon, color, value, label }) => (
  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
    <i className={`fas ${icon} ${color} text-lg mb-1`}></i>
    <p className="text-lg font-black text-white">{value}</p>
    <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
  </div>
);

export default LeaderboardView;
