import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Lightbulb, RotateCcw, Send, Trophy, X } from 'lucide-react';
import { QuizQuestion, QuizResult } from '../types';
import { Button, Card, ProgressRing } from './ui';
import { cn } from '../lib/cn';

interface QuizViewProps {
    questions: QuizQuestion[];
    levelId: string;
    onSubmit: (result: QuizResult) => void;
    existingResult?: QuizResult;
}

const QuizView: React.FC<QuizViewProps> = ({ questions, levelId, onSubmit, existingResult }) => {
    const valid = existingResult && existingResult.answers?.length === questions.length;
    const [answers, setAnswers] = useState<number[]>(valid ? existingResult!.answers : new Array(questions.length).fill(-1));
    const [result, setResult] = useState<QuizResult | null>(valid ? existingResult! : null);
    const [step, setStep] = useState(0);
    const [dir, setDir] = useState(1);

    const submitted = !!result;
    const answered = answers.filter((a) => a >= 0).length;

    const choose = (q: number, o: number) => {
        if (submitted) return;
        setAnswers((prev) => prev.map((a, i) => (i === q ? o : a)));
        // advance automatically after a short beat
        if (q < questions.length - 1) setTimeout(() => { setDir(1); setStep(q + 1); }, 260);
    };

    const submit = () => {
        const score = questions.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0);
        const r: QuizResult = { levelId, score, total: questions.length, answers, submittedAt: new Date().toISOString() };
        setResult(r);
        onSubmit(r);
    };

    const retake = () => {
        setAnswers(new Array(questions.length).fill(-1));
        setResult(null);
        setStep(0);
    };

    // ── Results ──
    if (submitted && result) {
        const pct = Math.round((result.score / result.total) * 100);
        return (
            <div className="space-y-4">
                <Card className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:p-8">
                    <ProgressRing value={pct} size={120} stroke={10}>
                        <div className="text-3xl font-semibold">{pct}%</div>
                    </ProgressRing>
                    <div className="flex-1 text-center sm:text-left">
                        <div className="flex items-center justify-center gap-2 sm:justify-start">
                            <Trophy className={cn('size-5', pct >= 80 ? 'text-amber-500' : 'text-subtle')} />
                            <h3 className="text-xl font-semibold tracking-tight">
                                {pct === 100 ? 'Flawless!' : pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Good effort!' : 'Keep going — review and retry'}
                            </h3>
                        </div>
                        <p className="mt-1 text-muted">You answered {result.score} of {result.total} correctly. Explanations are below.</p>
                    </div>
                    <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={retake}>Retake</Button>
                </Card>

                {questions.map((q, qi) => {
                    const user = answers[qi];
                    const right = user === q.correctIndex;
                    return (
                        <Card key={q.id || qi} className="p-5 sm:p-6">
                            <div className="flex items-start gap-3">
                                <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white', right ? 'bg-emerald-500' : 'bg-red-500')}>
                                    {right ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
                                </span>
                                <p className="font-medium">{q.question}</p>
                            </div>
                            <div className="mt-4 grid gap-2 pl-9">
                                {q.options.map((opt, oi) => (
                                    <div
                                        key={oi}
                                        className={cn(
                                            'rounded-xl border px-3.5 py-2.5 text-sm',
                                            oi === q.correctIndex ? 'border-emerald-500/40 bg-emerald-500/10 text-ink'
                                                : oi === user ? 'border-red-500/40 bg-red-500/10 text-muted line-through'
                                                    : 'border-line text-subtle',
                                        )}
                                    >
                                        <span className="mr-2 font-mono text-xs">{String.fromCharCode(65 + oi)}</span>{opt}
                                    </div>
                                ))}
                            </div>
                            {q.explanation && (
                                <div className="ml-9 mt-4 flex gap-2 rounded-xl bg-brand-500/[0.07] p-3.5 text-sm text-muted">
                                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-500" />
                                    <span>{q.explanation}</span>
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>
        );
    }

    // ── One question at a time ──
    const q = questions[step];
    return (
        <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
                <div className="text-sm font-medium">Question {step + 1} <span className="text-subtle">/ {questions.length}</span></div>
                <div className="flex gap-1">
                    {questions.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => { setDir(i > step ? 1 : -1); setStep(i); }}
                            className={cn('h-1.5 w-6 rounded-full transition sm:w-8', i === step ? 'bg-brand-500' : answers[i] >= 0 ? 'bg-brand-500/40' : 'bg-sunken')}
                            aria-label={`Question ${i + 1}`}
                        />
                    ))}
                </div>
            </div>

            <div className="relative min-h-[340px] overflow-hidden px-5 py-7 sm:px-8">
                <AnimatePresence mode="wait" custom={dir}>
                    <motion.div
                        key={step}
                        custom={dir}
                        initial={{ opacity: 0, x: dir * 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: dir * -30 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <h3 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{q.question}</h3>
                        <div className="mt-6 grid gap-2.5">
                            {q.options.map((opt, oi) => {
                                const selected = answers[step] === oi;
                                return (
                                    <button
                                        key={oi}
                                        onClick={() => choose(step, oi)}
                                        className={cn(
                                            'group flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition',
                                            selected ? 'border-brand-500 bg-brand-500/10 text-ink ring-4 ring-brand-500/10' : 'border-line bg-surface/50 text-muted hover:border-line-strong hover:text-ink',
                                        )}
                                    >
                                        <span className={cn(
                                            'flex size-7 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-semibold transition',
                                            selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-line-strong text-subtle group-hover:text-ink',
                                        )}>
                                            {String.fromCharCode(65 + oi)}
                                        </span>
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="flex items-center justify-between border-t border-line bg-sunken/40 px-5 py-4 sm:px-8">
                <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => { setDir(-1); setStep(step - 1); }}>
                    <ArrowLeft className="size-4" /> Back
                </Button>
                {step < questions.length - 1 ? (
                    <Button variant="secondary" size="sm" onClick={() => { setDir(1); setStep(step + 1); }}>
                        Next <ArrowRight className="size-4" />
                    </Button>
                ) : (
                    <Button variant="primary" size="sm" disabled={answered < questions.length} onClick={submit} icon={<Send className="size-3.5" />}>
                        Submit ({answered}/{questions.length})
                    </Button>
                )}
            </div>
        </Card>
    );
};

export default QuizView;
