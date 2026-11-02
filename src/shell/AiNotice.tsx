import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useAiStatus } from '../lib/aiStatus';
import { cn } from '../lib/cn';

/** Site-wide notice while the AI backend is down, so failures aren't a surprise. */
const AiNotice: React.FC<{ className?: string }> = ({ className }) => {
    const available = useAiStatus();
    const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem('cognify_ai_notice') === '1'; } catch { return false; } });
    if (available !== false || hidden) return null;
    return (
        <div role="status" className={cn('border-b-2 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200', className)}>
            <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2 text-sm font-semibold">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="flex-1">AI features (new lessons, quizzes, the tutor and notes) are temporarily unavailable. Saved lessons, practice, rooms and your progress still work.</span>
                <button onClick={() => { setHidden(true); try { sessionStorage.setItem('cognify_ai_notice', '1'); } catch { /* ignore */ } }} className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900" aria-label="Dismiss"><X className="size-4" /></button>
            </div>
        </div>
    );
};

export default AiNotice;
