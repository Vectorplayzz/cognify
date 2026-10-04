import React, { useState, useEffect, useRef } from 'react';
import { RoadmapLevel, Subtopic, QuizQuestion, QuizResult } from '../types';
import { aiService } from '../services/llamaService';
import { progressService } from '../services/progressService';
import QuizView from './QuizView';
import * as api from '../services/apiService';

interface LevelViewProps {
    level: RoadmapLevel;
    topic: string;
    roadmapId: string;
    roadmapDbId?: number;
    onBack: () => void;
    onNext: () => void;
    isLastLevel: boolean;
}

const LevelView: React.FC<LevelViewProps> = ({ level, topic, roadmapId, roadmapDbId, onBack, onNext, isLastLevel }) => {
    const [subtopics, setSubtopics] = useState<Subtopic[]>(level.subtopics || []);
    const [activeSubtopicIdx, setActiveSubtopicIdx] = useState(-1);
    const [subtopicContent, setSubtopicContent] = useState<Record<string, string>>({});
    const [loadingSubtopics, setLoadingSubtopics] = useState(level.subtopics.length === 0);
    const [loadingContent, setLoadingContent] = useState(false);
    const [overviewContent, setOverviewContent] = useState(level.theoryContent || '');
    const [loadingOverview, setLoadingOverview] = useState(!level.theoryContent);
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(level.quiz || []);
    const [loadingQuiz, setLoadingQuiz] = useState(level.quiz.length === 0);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'theory' | 'quiz'>('theory');
    const [quizCompleted, setQuizCompleted] = useState(false);
    const [xpEarned, setXpEarned] = useState(0);
    const [isStreaming, setIsStreaming] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [dataLoaded, setDataLoaded] = useState(false);

    const isCompleted = progressService.isLevelCompleted(roadmapId, level.id);
    const activeSubtopic = activeSubtopicIdx >= 0 ? subtopics[activeSubtopicIdx] : null;

    // ── Load everything: Check DB first, then generate if needed ──
    useEffect(() => {
        // Use local var to track loading within this effect run
        let cancelled = false;
        let loadedFromDB = false;

        //         // console.log('[LevelView] Effect run:', { roadmapDbId, levelId: level.id, hasTheory: !!level.theoryContent, subtopicsLen: level.subtopics?.length });

        const loadAll = async () => {
            // If we have roadmapDbId, try to load from DB first
            if (roadmapDbId && level.id) {
                console.log('[LevelView] Checking DB for:', { roadmapDbId, levelId: level.id });
                try {
                    // Parallel DB calls for content and quiz
                    const [contentResult, quizResult] = await Promise.all([
                        api.getLevelContent(roadmapDbId, level.id),
                        api.getLevelQuiz(roadmapDbId, level.id)
                    ]);

                    if (cancelled) return;
                    loadedFromDB = true;

                    // Check what we have in DB - must check for actual content, not just truthy!
                    console.log('[LevelView] DB raw response:', { contentResult, quizResult });
                    const hasContent = contentResult.exists && typeof contentResult.theory_content === 'string' && contentResult.theory_content.trim().length > 0;
                    const hasSubtopics = contentResult.exists && Array.isArray(contentResult.subtopics) && contentResult.subtopics.length > 0;
                    const hasQuiz = quizResult.exists && Array.isArray(quizResult.questions) && quizResult.questions.length > 0;

                    console.log('[LevelView] DB check:', { hasContent, hasSubtopics, hasQuiz });

                    if (hasContent) {
                        setOverviewContent(contentResult.theory_content);
                        setLoadingOverview(false);
                        console.log('[LevelView] ✓ Loaded theory from DB');
                    }
                    if (hasSubtopics) {
                        setSubtopics(contentResult.subtopics);
                        setLoadingSubtopics(false);
                        console.log('[LevelView] ✓ Loaded subtopics from DB');
                    }
                    if (hasQuiz) {
                        setQuizQuestions(quizResult.questions);
                        setLoadingQuiz(false);
                        console.log('[LevelView] ✓ Loaded quiz from DB');
                    }

                    // Now generate what's missing
                    // IMPORTANT: Always save BOTH theory_content and subtopics to avoid overwriting!
                    if (!hasContent) {
                        console.log('[LevelView] → Generating theory...');
                        setLoadingOverview(true);
                        setIsStreaming(true);
                        try {
                            const content = await aiService.generateLevelContentStream(
                                topic, level.title, level.description,
                                (acc) => { if (!cancelled) setOverviewContent(acc); }
                            );
                            if (!cancelled) {
                                setLoadingOverview(false);
                                setIsStreaming(false);
                                // Save to DB - include EXISTING subtopics to avoid overwriting!
                                try {
                                    await api.saveLevelContent({
                                        roadmap_id: roadmapDbId,
                                        level_id: level.id,
                                        theory_content: content,
                                        subtopics: hasSubtopics ? contentResult.subtopics : []
                                    });
                                    console.log('[LevelView] ✓ Saved theory to DB');
                                } catch (e) { console.error('[LevelView] Failed to save theory:', e); }
                            }
                        } catch (e) { if (!cancelled) { setLoadingOverview(false); setIsStreaming(false); } }
                    }

                    if (!hasSubtopics) {
                        console.log('[LevelView] → Generating subtopics...');
                        setLoadingSubtopics(true);
                        try {
                            const subs = await aiService.generateSubtopics(topic, level.title, level.description);
                            const mapped: Subtopic[] = subs.map((s, i) => ({ id: `${level.id}-sub${i}`, title: s.title, description: s.description, content: '' }));
                            if (!cancelled) {
                                setSubtopics(mapped);
                                setLoadingSubtopics(false);
                                // Save to DB - include EXISTING theory_content to avoid overwriting!
                                try {
                                    await api.saveLevelContent({
                                        roadmap_id: roadmapDbId,
                                        level_id: level.id,
                                        subtopics: mapped,
                                        theory_content: hasContent ? contentResult.theory_content : ''
                                    });
                                    console.log('[LevelView] ✓ Saved subtopics to DB');
                                } catch (e) { console.error('[LevelView] Failed to save subtopics:', e); }
                            }
                        } catch (e) { if (!cancelled) setLoadingSubtopics(false); }
                    }

                    if (!hasQuiz) {
                        console.log('[LevelView] → Generating quiz...');
                        setLoadingQuiz(true);
                        try {
                            const questions = await aiService.generateQuiz(topic, level.title);
                            const mapped: QuizQuestion[] = questions.map((q, i) => ({ id: `${level.id}-q${i}`, ...q }));
                            if (!cancelled) {
                                setQuizQuestions(mapped);
                                setLoadingQuiz(false);
                                // Save to DB
                                try {
                                    await api.saveLevelQuiz({ roadmap_id: roadmapDbId, level_id: level.id, questions: mapped });
                                    console.log('[LevelView] ✓ Saved quiz to DB');
                                } catch (e) { console.error('[LevelView] Failed to save quiz:', e); }
                            }
                        } catch (e) { if (!cancelled) setLoadingQuiz(false); }
                    }

                    // Mark as loaded
                    setDataLoaded(true);
                    return;
                } catch (dbErr) {
                    console.error('[LevelView] DB load failed:', dbErr);
                    loadedFromDB = true; // Mark as done to avoid re-triggering
                }
            }

            // No DB available - generate directly
            if (!loadedFromDB) {
                console.log('[LevelView] No DB, generating directly...');
                setLoadingOverview(true);
                setLoadingSubtopics(true);
                setLoadingQuiz(true);

                try {
                    const content = await aiService.generateLevelContentStream(
                        topic, level.title, level.description,
                        (acc) => { if (!cancelled) setOverviewContent(acc); }
                    );
                    if (!cancelled) {
                        setLoadingOverview(false);
                        setIsStreaming(false);
                    }
                } catch (e) { if (!cancelled) { setLoadingOverview(false); setIsStreaming(false); } }

                try {
                    const subs = await aiService.generateSubtopics(topic, level.title, level.description);
                    const mapped: Subtopic[] = subs.map((s, i) => ({ id: `${level.id}-sub${i}`, title: s.title, description: s.description, content: '' }));
                    if (!cancelled) {
                        setSubtopics(mapped);
                        setLoadingSubtopics(false);
                    }
                } catch (e) { if (!cancelled) setLoadingSubtopics(false); }

                try {
                    const questions = await aiService.generateQuiz(topic, level.title);
                    const mapped: QuizQuestion[] = questions.map((q, i) => ({ id: `${level.id}-q${i}`, ...q }));
                    if (!cancelled) {
                        setQuizQuestions(mapped);
                        setLoadingQuiz(false);
                    }
                } catch (e) { if (!cancelled) setLoadingQuiz(false); }

                setDataLoaded(true);
            }
        };

        loadAll();
        return () => { cancelled = true; };
    }, [level.id, roadmapDbId]);

    // ── Load subtopic content with TRUE STREAMING ──
    useEffect(() => {
        if (!activeSubtopic) return;
        if (activeSubtopic.content || subtopicContent[activeSubtopic.id]) return;

        let cancelled = false;
        setLoadingContent(true);
        setIsStreaming(true);

        aiService.generateSubtopicContentStream(
            topic, level.title, activeSubtopic.title, activeSubtopic.description,
            (accumulated) => {
                if (!cancelled) {
                    setSubtopicContent(prev => ({ ...prev, [activeSubtopic.id]: accumulated }));
                }
            }
        )
            .then((content) => { if (!cancelled) activeSubtopic.content = content; })
            .catch((err) => { if (!cancelled) setError('Failed to load subtopic.'); console.error(err); })
            .finally(() => { if (!cancelled) { setLoadingContent(false); setIsStreaming(false); } });

        return () => { cancelled = true; };
    }, [activeSubtopicIdx, activeSubtopic?.id]);

    const handleQuizSubmit = (result: QuizResult) => {
        progressService.saveQuizResult(roadmapId, topic, result, roadmapDbId);
        progressService.completeLevel(roadmapId, topic, level.id, level.xpReward, roadmapDbId);
        setQuizCompleted(true);
        setXpEarned(level.xpReward);
    };

    const existingResult = progressService.getRoadmapProgress(roadmapId)
        ?.quizResults.find(r => r.levelId === level.id);

    const currentContent = activeSubtopic
        ? (subtopicContent[activeSubtopic.id] || activeSubtopic.content || '')
        : overviewContent;

    const isCurrentlyLoading = activeSubtopicIdx === -1 ? loadingOverview : loadingContent;

    // ── Markdown renderer ──
    const renderMarkdown = (text: string) => {
        return text.split('\n').map((line, i) => {
            if (line.startsWith('### ')) return <h4 key={i} className="text-lg font-bold text-white mt-6 mb-2">{line.slice(4)}</h4>;
            if (line.startsWith('## ')) return <h3 key={i} className="text-xl font-bold text-white mt-6 mb-3">{line.slice(3)}</h3>;
            if (line.startsWith('# ')) return <h2 key={i} className="text-2xl font-bold text-white mt-6 mb-3">{line.slice(2)}</h2>;
            if (line.startsWith('- ') || line.startsWith('* ')) {
                return (
                    <div key={i} className="flex items-start gap-2 ml-4 mb-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0"></span>
                        <span className="text-slate-300 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }}></span>
                    </div>
                );
            }
            if (line.startsWith('```')) return null;
            if (line.trim() === '') return <div key={i} className="h-3"></div>;
            return <p key={i} className="text-slate-300 text-sm leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: formatInline(line) }}></p>;
        });
    };

    const formatInline = (text: string): string => {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
            .replace(/`(.+?)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 text-xs font-mono">$1</code>')
            .replace(/\*(.+?)\*/g, '<em class="text-slate-200">$1</em>');
    };

    return (
        <div className="max-w-6xl mx-auto py-6">
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-6">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
                    <i className="fas fa-arrow-left"></i>
                    <span>Back to Roadmap</span>
                </button>
                <div className="flex items-center gap-3">
                    {isCompleted && (
                        <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                            <i className="fas fa-check mr-1"></i> Completed
                        </span>
                    )}
                    <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold">
                        <i className="fas fa-bolt mr-1"></i> +{level.xpReward} XP
                    </span>
                </div>
            </div>

            {/* Level Header */}
            <div className="mb-6">
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 mb-2 block">Level {level.order}</span>
                <h1 className="text-3xl font-extrabold text-white mb-2">{level.title}</h1>
                <p className="text-slate-400 text-sm">{level.description}</p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('theory')}
                    className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'theory'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'text-slate-400 hover:text-white'}`}
                >
                    <i className="fas fa-book-open mr-2"></i>Theory
                </button>
                <button
                    onClick={() => setActiveTab('quiz')}
                    className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'quiz'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                        : 'text-slate-400 hover:text-white'}`}
                >
                    <i className="fas fa-question-circle mr-2"></i>Quiz
                    {existingResult && <i className="fas fa-check ml-2 text-emerald-400"></i>}
                </button>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
                    <i className="fas fa-exclamation-triangle mr-2"></i>{error}
                </div>
            )}

            {/* ═══ THEORY TAB ═══ */}
            {activeTab === 'theory' && (
                <div className="flex gap-6">
                    {/* Subtopic Sidebar */}
                    <div className="w-64 flex-shrink-0">
                        <div className="sticky top-6 space-y-2">
                            <button
                                onClick={() => setActiveSubtopicIdx(-1)}
                                className={`w-full text-left p-3 rounded-xl text-sm font-semibold transition-all ${activeSubtopicIdx === -1
                                    ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
                                    : 'bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${activeSubtopicIdx === -1 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'
                                        }`}>
                                        <i className="fas fa-home"></i>
                                    </div>
                                    <span>Overview</span>
                                </div>
                            </button>

                            <div className="px-3 pt-2 pb-1">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-600">Sub-modules</p>
                            </div>

                            {loadingSubtopics && (
                                <div className="p-4 text-center">
                                    <div className="w-6 h-6 mx-auto mb-2 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                                    <p className="text-xs text-slate-500">Loading subtopics...</p>
                                </div>
                            )}

                            {subtopics.map((sub, idx) => (
                                <button
                                    key={sub.id}
                                    onClick={() => setActiveSubtopicIdx(idx)}
                                    className={`w-full text-left p-3 rounded-xl text-sm transition-all group ${activeSubtopicIdx === idx
                                        ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
                                        : 'bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${activeSubtopicIdx === idx ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500 group-hover:text-indigo-400'
                                            }`}>
                                            {idx + 1}
                                        </div>
                                        <p className="truncate font-semibold text-xs">{sub.title}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 min-w-0" ref={contentRef}>
                        {activeSubtopic && (
                            <div className="mb-6 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">
                                    Sub-module {activeSubtopicIdx + 1} of {subtopics.length}
                                </span>
                                <h2 className="text-xl font-bold text-white">{activeSubtopic.title}</h2>
                                <p className="text-slate-400 text-sm mt-1">{activeSubtopic.description}</p>
                            </div>
                        )}

                        <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800">
                            {/* Spinner only when loading AND no content yet */}
                            {isCurrentlyLoading && !currentContent && (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="relative w-16 h-16 mb-6">
                                        <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
                                        <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
                                    </div>
                                    <p className="text-slate-400 text-sm">
                                        {activeSubtopicIdx === -1 ? 'Generating overview...' : `Loading "${activeSubtopic?.title}"...`}
                                    </p>
                                </div>
                            )}

                            {/* Content — text appears token-by-token as it streams */}
                            {currentContent && (
                                <div className="prose-custom">
                                    {renderMarkdown(currentContent)}
                                    {isStreaming && (
                                        <span className="inline-block w-2 h-5 bg-indigo-400 animate-pulse ml-0.5 rounded-sm align-text-bottom"></span>
                                    )}
                                </div>
                            )}

                            {!isCurrentlyLoading && !currentContent && (
                                <div className="text-center py-16">
                                    <i className="fas fa-book text-4xl text-slate-700 mb-4 block"></i>
                                    <p className="text-slate-500">Select a subtopic to start learning.</p>
                                </div>
                            )}
                        </div>

                        {activeSubtopicIdx >= 0 && subtopics.length > 0 && (
                            <div className="flex justify-between mt-4">
                                <button
                                    onClick={() => setActiveSubtopicIdx(Math.max(-1, activeSubtopicIdx - 1))}
                                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all text-xs font-bold"
                                >
                                    <i className="fas fa-arrow-left mr-2"></i>
                                    {activeSubtopicIdx === 0 ? 'Overview' : subtopics[activeSubtopicIdx - 1]?.title}
                                </button>
                                {activeSubtopicIdx < subtopics.length - 1 && (
                                    <button
                                        onClick={() => setActiveSubtopicIdx(activeSubtopicIdx + 1)}
                                        className="px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-all text-xs font-bold"
                                    >
                                        {subtopics[activeSubtopicIdx + 1]?.title}
                                        <i className="fas fa-arrow-right ml-2"></i>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ QUIZ TAB ═══ */}
            {activeTab === 'quiz' && (
                <div>
                    {loadingQuiz ? (
                        <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center py-16">
                            <div className="relative w-16 h-16 mb-6">
                                <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
                                <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-slate-400 text-sm">Generating quiz questions...</p>
                        </div>
                    ) : quizQuestions.length > 0 ? (
                        <QuizView
                            questions={quizQuestions}
                            levelId={level.id}
                            onSubmit={handleQuizSubmit}
                            existingResult={existingResult}
                        />
                    ) : (
                        <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 text-center py-16">
                            <i className="fas fa-exclamation-circle text-4xl text-slate-600 mb-4"></i>
                            <p className="text-slate-400">No quiz questions available.</p>
                        </div>
                    )}
                </div>
            )}

            {/* XP Toast */}
            {quizCompleted && xpEarned > 0 && (
                <div className="fixed bottom-8 right-8 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 backdrop-blur-sm z-50 animate-bounce">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/30 flex items-center justify-center">
                            <i className="fas fa-bolt text-emerald-400"></i>
                        </div>
                        <div>
                            <p className="text-emerald-300 font-bold text-sm">+{xpEarned} XP Earned!</p>
                            <p className="text-emerald-400/60 text-xs">Level completed</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Nav */}
            <div className="flex justify-between mt-8">
                <button onClick={onBack} className="px-6 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all text-sm font-bold">
                    <i className="fas fa-arrow-left mr-2"></i>Back to Roadmap
                </button>
                {!isLastLevel && (
                    <button onClick={onNext} className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm hover:shadow-lg hover:shadow-indigo-500/25 transition-all">
                        Next Level<i className="fas fa-arrow-right ml-2"></i>
                    </button>
                )}
            </div>
        </div>
    );
};

export default LevelView;
