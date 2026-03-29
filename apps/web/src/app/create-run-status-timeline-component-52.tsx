'use client';

import { RunStatus } from './types';

interface TimelineProps {
    status: RunStatus;
    /** Dates in ISO format or readable strings for the history */
    queuedAt?: string;
    startedAt?: string;
    finishedAt?: string;
}

export default function RunStatusTimeline({ status, queuedAt, startedAt, finishedAt }: TimelineProps) {
    const isRunning = status === 'running';
    const isFinalState = status === 'completed' || status === 'failed' || status === 'cancelled';
    
    // Determine the label for the final state
    const finalLabel = status === 'running' ? 'Completed' : status.charAt(0).toUpperCase() + status.slice(1);

    const steps = [
        {
            id: 'queued',
            label: 'Queued',
            description: 'Run accepted',
            time: queuedAt || 'N/A',
            isComplete: true, // Always completed if it's in the system
            isActive: false,
        },
        {
            id: 'running',
            label: 'Running',
            description: 'Fuzzing in progress',
            time: startedAt || 'Pending',
            isComplete: isFinalState,
            isActive: isRunning,
        },
        {
            id: 'final',
            label: finalLabel,
            description: status === 'failed' ? 'Issues found' : (status === 'cancelled' ? 'Aborted' : 'Run finished'),
            time: finishedAt || 'Pending',
            isComplete: isFinalState,
            isActive: false,
        }
    ];

    return (
        <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl p-6 shadow-sm w-full font-sans">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                State History Timeline
            </h2>
            <div className="relative flex flex-col md:flex-row justify-between w-full">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-1/2 left-8 right-8 h-[2px] -translate-y-1/2 bg-zinc-200 dark:bg-zinc-800" aria-hidden="true" />
                {/* Connecting Line (Mobile) */}
                <div className="md:hidden absolute left-[15px] top-6 bottom-6 w-[2px] bg-zinc-200 dark:bg-zinc-800" aria-hidden="true" />

                {steps.map((step, idx) => {
                    const StateIcon = () => {
                        if (step.isComplete) {
                            return (
                                <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center
                                    ${step.id === 'final' && status === 'failed' ? 'bg-red-500 text-white' : ''}
                                    ${step.id === 'final' && status === 'cancelled' ? 'bg-amber-500 text-white' : ''}
                                    ${(step.id !== 'final' || status === 'completed') ? 'bg-blue-600 text-white' : ''}
                                `}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        {step.id === 'final' && status === 'failed' ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                        ) : step.id === 'final' && status === 'cancelled' ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M18 12H6" />
                                        ) : (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        )}
                                    </svg>
                                </div>
                            );
                        } else if (step.isActive) {
                            return (
                                <div className="relative z-10 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-600 dark:border-blue-500 flex items-center justify-center">
                                    <div className="w-2.5 h-2.5 bg-blue-600 dark:bg-blue-500 rounded-full animate-pulse" />
                                </div>
                            );
                        } else {
                            return (
                                <div className="relative z-10 w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700" />
                            );
                        }
                    };

                    return (
                        <div key={step.id} className="relative flex md:flex-col items-start md:items-center gap-4 md:gap-3 flex-1 mb-8 md:mb-0 last:mb-0">
                            {/* Connecting Line active fill (Mobile) */}
                            {idx < steps.length - 1 && steps[idx + 1].isComplete && (
                                <div className="md:hidden absolute left-[15px] top-8 bottom-[-2rem] w-[2px] bg-blue-600" aria-hidden="true" />
                            )}
                            {/* Connecting Line active fill (Desktop) */}
                            {idx < steps.length - 1 && steps[idx + 1].isComplete && (
                                <div className="hidden md:block absolute top-[15px] left-[50%] right-[-50%] h-[2px] bg-blue-600" aria-hidden="true" />
                            )}

                            <div className="shrink-0 pt-1 md:pt-0 bg-white dark:bg-zinc-950 rounded-full">
                                <StateIcon />
                            </div>
                            
                            <div className="flex flex-col md:text-center mt-1 md:mt-0 min-w-[120px]">
                                <span className={`font-medium ${step.isComplete || step.isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-500'}`}>
                                    {step.label}
                                </span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    {step.description}
                                </span>
                                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 dark:text-zinc-500 mt-1.5">
                                    {step.time}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
