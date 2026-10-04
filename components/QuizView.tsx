import React, { useState } from 'react';
import { QuizQuestion, QuizResult } from '../types';

interface QuizViewProps {
    questions: QuizQuestion[];
    levelId: string;
    onSubmit: (result: QuizResult) => void;
    existingResult?: QuizResult;
}

const QuizView: React.FC<QuizViewProps> = ({ questions, levelId, onSubmit, existingResult }) => {
    const [selectedAnswers, setSelectedAnswers] = useState<number[]>(
        existingResult?.answers ?? new Array(questions.length).fill(-1)
    );
    const [submitted, setSubmitted] = useState(!!existingResult);
    const [result, setResult] = useState<QuizResult | null>(existingResult ?? null);

    const selectAnswer = (questionIdx: number, optionIdx: number) => {
        if (submitted) return;
        const newAnswers = [...selectedAnswers];
        newAnswers[questionIdx] = optionIdx;
        setSelectedAnswers(newAnswers);
    };

    const handleSubmit = () => {
        const score = questions.reduce((acc, q, i) => {
            return acc + (selectedAnswers[i] === q.correctIndex ? 1 : 0);
        }, 0);
        const quizResult: QuizResult = {
            levelId,
            score,
            total: questions.length,
            answers: selectedAnswers,
            submittedAt: new Date().toISOString(),
        };
        setResult(quizResult);
        setSubmitted(true);
        onSubmit(quizResult);
    };

    const allAnswered = selectedAnswers.every(a => a >= 0);
    const scorePercent = result ? Math.round((result.score / result.total) * 100) : 0;

    return (
        <div className="space-y-6">
            {/* Quiz Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                        <i className="fas fa-question text-purple-400"></i>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Knowledge Check</h3>
                        <p className="text-xs text-slate-400">{questions.length} questions</p>
                    </div>
                </div>
                {submitted && result && (
                    <div className={`px-4 py-2 rounded-xl font-bold text-sm ${scorePercent >= 80 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            scorePercent >= 50 ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                        <i className={`fas ${scorePercent >= 80 ? 'fa-trophy' : scorePercent >= 50 ? 'fa-star-half-alt' : 'fa-times-circle'} mr-2`}></i>
                        {result.score}/{result.total} ({scorePercent}%)
                    </div>
                )}
            </div>

            {/* Questions */}
            {questions.map((q, qIdx) => {
                const userAnswer = selectedAnswers[qIdx];
                const isCorrect = submitted && userAnswer === q.correctIndex;
                const isWrong = submitted && userAnswer !== q.correctIndex && userAnswer >= 0;

                return (
                    <div key={q.id} className={`p-5 rounded-2xl border transition-all ${submitted
                            ? isCorrect ? 'bg-emerald-500/5 border-emerald-500/20' : isWrong ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-900/50 border-slate-800'
                            : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                        }`}>
                        <p className="text-sm font-semibold text-white mb-4">
                            <span className="text-indigo-400 mr-2">Q{qIdx + 1}.</span>
                            {q.question}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {q.options.map((opt, oIdx) => {
                                const isSelected = userAnswer === oIdx;
                                const isCorrectOption = q.correctIndex === oIdx;

                                let optionStyle = 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer';
                                if (isSelected && !submitted) {
                                    optionStyle = 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/30';
                                }
                                if (submitted) {
                                    if (isCorrectOption) {
                                        optionStyle = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300';
                                    } else if (isSelected && !isCorrectOption) {
                                        optionStyle = 'bg-red-500/10 border-red-500/40 text-red-300 line-through';
                                    } else {
                                        optionStyle = 'bg-slate-800/30 border-slate-800 text-slate-500';
                                    }
                                }

                                return (
                                    <button
                                        key={oIdx}
                                        onClick={() => selectAnswer(qIdx, oIdx)}
                                        disabled={submitted}
                                        className={`p-3 rounded-xl border text-left text-sm transition-all ${optionStyle} ${submitted ? 'cursor-default' : ''}`}
                                    >
                                        <span className="font-bold mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                                        {opt}
                                        {submitted && isCorrectOption && (
                                            <i className="fas fa-check ml-2 text-emerald-400"></i>
                                        )}
                                        {submitted && isSelected && !isCorrectOption && (
                                            <i className="fas fa-times ml-2 text-red-400"></i>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Explanation (shown after submit) */}
                        {submitted && (
                            <div className="mt-4 p-3 rounded-xl bg-slate-800/50 border border-slate-700">
                                <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">
                                    <i className="fas fa-lightbulb mr-1"></i> Explanation
                                </p>
                                <p className="text-sm text-slate-300">{q.explanation}</p>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Submit Button */}
            {!submitted && (
                <button
                    onClick={handleSubmit}
                    disabled={!allAnswered}
                    className="w-full py-4 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                    <i className="fas fa-paper-plane"></i>
                    Submit Answers ({selectedAnswers.filter(a => a >= 0).length}/{questions.length} answered)
                </button>
            )}

            {/* Score Summary */}
            {submitted && result && (
                <div className={`p-6 rounded-2xl border text-center ${scorePercent >= 80 ? 'bg-emerald-500/5 border-emerald-500/20' :
                        scorePercent >= 50 ? 'bg-yellow-500/5 border-yellow-500/20' :
                            'bg-red-500/5 border-red-500/20'
                    }`}>
                    <div className="text-4xl font-black mb-2">
                        {scorePercent >= 80 ? '🎉' : scorePercent >= 50 ? '💪' : '📚'}
                    </div>
                    <p className="text-white font-bold text-lg">
                        {scorePercent >= 80 ? 'Excellent work!' : scorePercent >= 50 ? 'Good effort!' : 'Keep learning!'}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                        You got {result.score} out of {result.total} correct ({scorePercent}%)
                    </p>
                </div>
            )}
        </div>
    );
};

export default QuizView;
