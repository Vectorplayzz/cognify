import React, { useState } from 'react';

interface TopicSelectorProps {
    onSelectTopic: (topic: string) => void;
    isLoading: boolean;
}

const PRESET_TOPICS = [
    { name: 'Machine Learning', icon: 'fa-robot', gradient: 'from-blue-500 to-cyan-500', desc: 'Algorithms that learn from data' },
    { name: 'Web Development', icon: 'fa-globe', gradient: 'from-purple-500 to-pink-500', desc: 'Build modern web applications' },
    { name: 'Data Science', icon: 'fa-chart-bar', gradient: 'from-emerald-500 to-teal-500', desc: 'Extract insights from data' },
    { name: 'Python Programming', icon: 'fa-python', gradient: 'from-yellow-500 to-orange-500', desc: 'Master Python from scratch' },
    { name: 'Deep Learning', icon: 'fa-brain', gradient: 'from-red-500 to-rose-500', desc: 'Neural networks & beyond' },
    { name: 'Cloud Computing', icon: 'fa-cloud', gradient: 'from-indigo-500 to-violet-500', desc: 'AWS, Azure & GCP fundamentals' },
    { name: 'Cybersecurity', icon: 'fa-shield-alt', gradient: 'from-amber-500 to-yellow-600', desc: 'Protect systems & data' },
    { name: 'Blockchain', icon: 'fa-link', gradient: 'from-sky-500 to-blue-600', desc: 'Decentralized technologies' },
];

const TopicSelector: React.FC<TopicSelectorProps> = ({ onSelectTopic, isLoading }) => {
    const [customTopic, setCustomTopic] = useState('');

    const handleCustomSubmit = () => {
        if (customTopic.trim()) {
            onSelectTopic(customTopic.trim());
        }
    };

    return (
        <div className="max-w-5xl mx-auto py-8">
            {/* Header */}
            <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-6">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">AI-Powered Roadmaps</span>
                </div>
                <h1 className="text-4xl font-extrabold text-white mb-4">
                    What do you want to <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">learn?</span>
                </h1>
                <p className="text-slate-400 max-w-lg mx-auto">
                    Choose a topic or enter your own. Our AI will generate a personalized learning roadmap with theory and quizzes.
                </p>
            </div>

            {/* Custom Topic Input */}
            <div className="mb-10">
                <div className="flex gap-3 max-w-2xl mx-auto">
                    <div className="flex-1 relative">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                        <input
                            type="text"
                            value={customTopic}
                            onChange={(e) => setCustomTopic(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                            placeholder="Enter any topic... e.g. Quantum Computing, React Hooks, Calculus"
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-11 pr-4 py-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                            disabled={isLoading}
                        />
                    </div>
                    <button
                        onClick={handleCustomSubmit}
                        disabled={!customTopic.trim() || isLoading}
                        className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <i className="fas fa-circle-notch animate-spin"></i>
                                <span>Generating...</span>
                            </>
                        ) : (
                            <>
                                <i className="fas fa-wand-magic-sparkles"></i>
                                <span>Generate</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Preset Topics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PRESET_TOPICS.map((topic) => (
                    <button
                        key={topic.name}
                        onClick={() => onSelectTopic(topic.name)}
                        disabled={isLoading}
                        className="group relative p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${topic.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                            <i className={`fas ${topic.icon} text-white text-lg`}></i>
                        </div>
                        <h3 className="text-white font-bold text-sm mb-1 group-hover:text-indigo-300 transition-colors">{topic.name}</h3>
                        <p className="text-slate-500 text-xs">{topic.desc}</p>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <i className="fas fa-arrow-right text-indigo-400 text-xs"></i>
                        </div>
                    </button>
                ))}
            </div>

            {/* Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="text-center">
                        <div className="relative w-20 h-20 mx-auto mb-6">
                            <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
                            <i className="fas fa-brain absolute inset-0 flex items-center justify-center text-indigo-400 text-2xl"></i>
                        </div>
                        <h3 className="text-white font-bold text-lg mb-2">Generating Your Roadmap</h3>
                        <p className="text-slate-400 text-sm">AI is crafting a personalized learning path...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TopicSelector;
