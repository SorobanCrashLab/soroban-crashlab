'use client';

import { useState } from 'react';
import { simulateSeedReplay } from './replay';

interface AddReplayFromUiActionProps {
    /** Run ID to replay */
    runId: string;
    /** Callback triggered when the replay simulation starts/completes */
    onReplayInitiated: (newRunData: { id: string; status: 'running' }) => void;
}

/**
 * A component that provides a "Replay" button for a specific fuzzing run.
 * It handles the simulation call and manages its own loading state.
 */
export default function AddReplayFromUiAction({ runId, onReplayInitiated }: AddReplayFromUiActionProps) {
    const [isReplaying, setIsReplaying] = useState(false);

    const handleReplay = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click from triggering
        
        if (isReplaying) return;

        setIsReplaying(true);
        try {
            const { newRunId } = await simulateSeedReplay(runId);
            onReplayInitiated({ id: newRunId, status: 'running' });
        } catch (error) {
            console.error('Failed to replay run:', error);
            // In a real app, we might show a toast notification here
        } finally {
            setIsReplaying(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleReplay}
            disabled={isReplaying}
            className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${isReplaying 
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed' 
                    : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:scale-105 active:scale-95'
                }
            `}
            aria-label={`Replay fuzzing run ${runId}`}
        >
            {isReplaying ? (
                <>
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Replaying...
                </>
            ) : (
                <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Replay
                </>
            )}
        </button>
    );
}
