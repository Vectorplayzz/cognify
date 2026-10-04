import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
    ArrowRight, Blocks, Brain, ChartColumn, Cloud, Code2, Globe, Link2, Shield, Sparkles, Wand2,
} from 'lucide-react';
import { Button } from './ui';

interface TopicSelectorProps {
    onSelectTopic: (topic: string) => void;
    isLoading: boolean;
    loadingTopic?: string;
}

const PRESET_TOPICS = [
    { name: 'Machine Learning', icon: Brain, gradient: 'from-brand-500 to-indigo-500', desc: 'Algorithms that learn from data' },
    { name: 'Web Development', icon: Globe, gradient: 'from-fuchsia-500 to-pink-500', desc: 'Build modern web applications' },
    { name: 'Data Science', icon: ChartColumn, gradient: 'from-emerald-500 to-teal-500', desc: 'Extract insights from data' },
    { name: 'Python Programming', icon: Code2, gradient: 'from-amber-500 to-orange-500', desc: 'Master Python from scratch' },
    { name: 'Deep Learning', icon: Blocks, gradient: 'from-rose-500 to-red-500', desc: 'Neural networks & beyond' },
    { name: 'Cloud Computing', icon: Cloud, gradient: 'from-sky-500 to-cyan-500', desc: 'AWS, Azure & GCP fundamentals' },
    { name: 'Cybersecurity', icon: Shield, gradient: 'from-lime-500 to-emerald-600', desc: 'Protect systems & data' },
    { name: 'Blockchain', icon: Link2, gradient: 'from-violet-500 to-purple-600', desc: 'Decentralized technologies' },
];

const LOADING_STEPS = [
    'Looking for a curated roadmap…',
    'Mapping the prerequisites…',
    'Ordering levels from basics to mastery…',
    'Setting XP rewards and quizzes…',
    'Almost there…',
];

export const GeneratingOverlay: React.FC<{ topic?: string }> = ({ topic }) => {
    const [step, setStep] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 2600);
        return () => clearInterval(t);
    }, []);
    return (
        <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/80 px-6 backdrop-blur-md"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
            <div className="text-center">
                <div className="relative mx-auto size-28">
                    <div className="absolute inset-0 animate-spin-slow rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(124_92_255/0.8),rgb(34_211_238/0.8),transparent)] blur-md" />
                    <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-bg">
                        <Sparkles className="size-9 animate-pulse text-brand-400" />
                    </div>
                </div>
                <h3 className="mt-8 text-xl font-semibold tracking-tight">Building your path{topic ? <> for <span className="text-gradient">{topic}</span></> : null}</h3>
                <div className="mt-2 h-6 overflow-hidden text-sm text-muted">
                    <AnimatePresence mode="wait">
                        <motion.p key={step} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}>
                            {LOADING_STEPS[step]}
                        </motion.p>
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
};

const TopicSelector: React.FC<TopicSelectorProps> = ({ onSelectTopic, isLoading, loadingTopic }) => {
    const [customTopic, setCustomTopic] = useState('');

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (customTopic.trim()) onSelectTopic(customTopic.trim());
    };

    return (
        <div>
            <div className="card ring-gradient relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14">
                <div className="aurora absolute inset-0" />
                <div className="grid-bg absolute inset-0" />
                <div className="relative">
                    <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-600 dark:text-brand-300">
                        <Wand2 className="size-3.5" /> roadmap.sh curricula + AI
                    </div>
                    <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
                        What do you want to <span className="font-serif font-normal italic text-gradient">learn?</span>
                    </h1>
                    <p className="mx-auto mt-3 max-w-lg text-muted">
                        Name any topic. You’ll get a leveled path with lessons, sub-modules and a quiz for every step.
                    </p>
                    <form onSubmit={submit} className="mx-auto mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row">
                        <div className="relative flex-1">
                            <Sparkles className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand-400" />
                            <input
                                value={customTopic}
                                onChange={(e) => setCustomTopic(e.target.value)}
                                placeholder="e.g. Quantum computing, React hooks, Calculus"
                                className="input h-14 rounded-2xl pl-11 text-[15px]"
                                disabled={isLoading}
                                maxLength={200}
                            />
                        </div>
                        <Button type="submit" variant="primary" size="lg" className="h-14 rounded-2xl" disabled={!customTopic.trim()} loading={isLoading}>
                            Generate <ArrowRight className="size-4" />
                        </Button>
                    </form>
                </div>
            </div>

            <div className="mt-10">
                <div className="eyebrow mb-4">Popular starting points</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {PRESET_TOPICS.map((topic, i) => (
                        <motion.button
                            key={topic.name}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.04 * i, duration: 0.4 }}
                            onClick={() => onSelectTopic(topic.name)}
                            disabled={isLoading}
                            className="card card-hover group relative overflow-hidden p-5 text-left disabled:opacity-50"
                        >
                            <div className={`absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br ${topic.gradient} opacity-10 blur-2xl transition group-hover:opacity-30`} />
                            <div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${topic.gradient} text-white shadow-lg`}>
                                <topic.icon className="size-5" />
                            </div>
                            <h3 className="mt-4 font-semibold">{topic.name}</h3>
                            <p className="mt-0.5 text-sm text-subtle">{topic.desc}</p>
                            <ArrowRight className="absolute right-4 top-5 size-4 text-subtle opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </motion.button>
                    ))}
                </div>
            </div>

            <AnimatePresence>{isLoading && <GeneratingOverlay topic={loadingTopic} />}</AnimatePresence>
        </div>
    );
};

export default TopicSelector;
