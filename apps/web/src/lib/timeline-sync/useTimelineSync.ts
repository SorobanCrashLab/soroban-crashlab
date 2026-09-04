/**
 * React hook for bidirectional timeline synchronization.
 * Connects TimelineScrubber with ContractSequenceDiagramView.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { TimelineIndex, buildTimelineIndex, getCorrelatedFrame, getAdjacentLog, getAdjacentFrame, isMappingAmbiguous, isFrameMappingAmbiguous } from './index';
import { isEditableTarget } from '../is-editable-target';

export interface UseTimelineSyncOptions {
    epsilonMs?: number;
    useSequenceOrder?: boolean;
    smoothScroll?: boolean;
}

export interface TimelineSyncState {
    // Current selections
    selectedLogId: string | null;
    selectedFrameId: string | null;
    // Hover previews (ghost highlight)
    hoverLogId: string | null;
    hoverFrameId: string | null;
    // Pinned selections (click-pinned)
    pinnedLogId: string | null;
    pinnedFrameId: string | null;
    // Sync mode
    syncMode: 'soft' | 'hard' | 'off';
}

export interface TimelineSyncActions {
    // Selection actions
    selectLog: (logId: string) => void;
    selectFrame: (frameId: string) => void;
    // Hover actions (ghost highlight)
    hoverLog: (logId: string | null) => void;
    hoverFrame: (frameId: string | null) => void;
    // Pin actions (click to pin both sides)
    pinLog: (logId: string) => void;
    pinFrame: (frameId: string) => void;
    clearPin: () => void;
    // Keyboard navigation
    navigateLog: (direction: 'next' | 'prev') => void;
    navigateFrame: (direction: 'next' | 'prev') => void;
    // Sync mode
    setSyncMode: (mode: 'soft' | 'hard' | 'off') => void;
}

export function useTimelineSync(
    logs: Array<{ id: string; timestamp: number; message: string; level: string; stepId?: string; sequenceOrder?: number }>,
    frames: Array<{ id: string; order: number; caller: string; callee: string; method: string; status: string; durationMs: number; timestamp?: number }>,
    options: UseTimelineSyncOptions = {}
): [TimelineSyncState, TimelineSyncActions, TimelineIndex] {
    const {
        epsilonMs = 100,
        useSequenceOrder = true,
        smoothScroll = true,
    } = options;

    // Build timeline index
    const [index] = useState(() => {
        const logEntries = logs.map(l => ({
            id: l.id,
            timestamp: l.timestamp,
            level: (l.level as 'debug' | 'info' | 'warn' | 'error') || 'info',
            message: l.message,
            runId: '',
            stepId: l.stepId,
            sequenceOrder: l.sequenceOrder,
        }));
        const sequenceFrames = frames.map(f => ({
            id: f.id,
            order: f.order,
            caller: f.caller,
            callee: f.callee,
            method: f.method,
            status: (f.status as 'ok' | 'error' | 'pending') || 'ok',
            durationMs: f.durationMs,
            timestamp: f.timestamp,
        }));
        return buildTimelineIndex(logEntries, sequenceFrames, {
            epsilonMs,
            useSequenceOrder,
        });
    });

    // Sync state
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
    const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
    const [hoverLogId, setHoverLogId] = useState<string | null>(null);
    const [hoverFrameId, setHoverFrameId] = useState<string | null>(null);
    const [pinnedLogId, setPinnedLogId] = useState<string | null>(null);
    const [pinnedFrameId, setPinnedFrameId] = useState<string | null>(null);
    const [syncMode, setSyncMode] = useState<'soft' | 'hard' | 'off'>('soft');

    // Refs for scroll intent tracking
    const scrollIntentRef = useRef<'log' | 'frame' | null>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Soft sync: hover previews
    const handleHoverLog = useCallback((logId: string | null) => {
        setHoverLogId(logId);
        if (logId && syncMode === 'soft') {
            const frame = getCorrelatedFrame(index, logId);
            if (frame) setHoverFrameId(frame.id);
        } else if (!logId) {
            setHoverFrameId(null);
        }
    }, [index, syncMode]);

    const handleHoverFrame = useCallback((frameId: string | null) => {
        setHoverFrameId(frameId);
        if (frameId && syncMode === 'soft') {
            const logs = index.sequenceToLogs.get(frameId) || [];
            if (logs.length > 0) setHoverLogId(logs[0]);
        } else if (!frameId) {
            setHoverLogId(null);
        }
    }, [index, syncMode]);

    // Hard sync: click/pin - scrolls counterpart into view
    const handleSelectLog = useCallback((logId: string) => {
        setSelectedLogId(logId);
        scrollIntentRef.current = 'log';
        
        const frame = getCorrelatedFrame(index, logId);
        if (frame) {
            setSelectedFrameId(frame.id);
            if (syncMode === 'hard' && smoothScroll) {
                // Trigger scroll in sequence diagram
                const event = new CustomEvent('timeline-sync:scroll-to-frame', { detail: { frameId: frame.id } });
                window.dispatchEvent(event);
            }
        }
        
        if (syncMode === 'hard') {
            setPinnedLogId(logId);
            if (frame) setPinnedFrameId(frame.id);
        }
    }, [index, syncMode, smoothScroll]);

    const handleSelectFrame = useCallback((frameId: string) => {
        setSelectedFrameId(frameId);
        scrollIntentRef.current = 'frame';
        
        const logs = index.sequenceToLogs.get(frameId) || [];
        if (logs.length > 0) {
            const logId = logs[0];
            setSelectedLogId(logId);
            if (syncMode === 'hard' && smoothScroll) {
                // Trigger scroll in log scrubber
                const event = new CustomEvent('timeline-sync:scroll-to-log', { detail: { logId } });
                window.dispatchEvent(event);
            }
        }
        
        if (syncMode === 'hard') {
            setPinnedFrameId(frameId);
            if (logs.length > 0) setPinnedLogId(logs[0]);
        }
    }, [index, syncMode, smoothScroll]);

    const handlePinLog = useCallback((logId: string) => {
        setPinnedLogId(logId);
        const frame = getCorrelatedFrame(index, logId);
        if (frame) setPinnedFrameId(frame.id);
    }, [index]);

    const handlePinFrame = useCallback((frameId: string) => {
        setPinnedFrameId(frameId);
        const logs = index.sequenceToLogs.get(frameId) || [];
        if (logs.length > 0) setPinnedLogId(logs[0]);
    }, [index]);

    const handleClearPin = useCallback(() => {
        setPinnedLogId(null);
        setPinnedFrameId(null);
    }, []);

    // Keyboard navigation - arrow through frames moves log viewport and vice versa
    const handleNavigateLog = useCallback((direction: 'next' | 'prev') => {
        if (!selectedLogId) return;
        
        const adjacent = getAdjacentLog(index, selectedLogId, direction);
        if (adjacent) {
            handleSelectLog(adjacent.id);
        }
    }, [index, selectedLogId, handleSelectLog]);

    const handleNavigateFrame = useCallback((direction: 'next' | 'prev') => {
        if (!selectedFrameId) return;
        
        const adjacent = getAdjacentFrame(index, selectedFrameId, direction);
        if (adjacent) {
            handleSelectFrame(adjacent.id);
        }
    }, [index, selectedFrameId, handleSelectFrame]);

    // Handle global keyboard events for roving tabindex pattern
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle if we have a selection and not in an input
            if (isEditableTarget(e.target)) {
                return;
            }

            if (selectedLogId && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                e.preventDefault();
                handleNavigateLog(e.key === 'ArrowRight' ? 'next' : 'prev');
            } else if (selectedFrameId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                handleNavigateFrame(e.key === 'ArrowDown' ? 'next' : 'prev');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedLogId, selectedFrameId, handleNavigateLog, handleNavigateFrame]);

    // Listen for scroll sync events from counterpart views
    useEffect(() => {
        const handleScrollToLog = (e: CustomEvent) => {
            if (scrollIntentRef.current === 'log') return; // ignore own scroll
            scrollIntentRef.current = 'frame';
            handleSelectLog(e.detail.logId);
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = setTimeout(() => { scrollIntentRef.current = null; }, 100);
        };

        const handleScrollToFrame = (e: CustomEvent) => {
            if (scrollIntentRef.current === 'frame') return; // ignore own scroll
            scrollIntentRef.current = 'log';
            handleSelectFrame(e.detail.frameId);
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = setTimeout(() => { scrollIntentRef.current = null; }, 100);
        };

        window.addEventListener('timeline-sync:scroll-to-log', handleScrollToLog as EventListener);
        window.addEventListener('timeline-sync:scroll-to-frame', handleScrollToFrame as EventListener);

        return () => {
            window.removeEventListener('timeline-sync:scroll-to-log', handleScrollToLog as EventListener);
            window.removeEventListener('timeline-sync:scroll-to-frame', handleScrollToFrame as EventListener);
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        };
    }, [index, handleSelectLog, handleSelectFrame]);

    // Ambiguity detection
    const logAmbiguous = selectedLogId ? isMappingAmbiguous(index, selectedLogId) : false;
    const frameAmbiguous = selectedFrameId ? isFrameMappingAmbiguous(index, selectedFrameId) : false;

    const state: TimelineSyncState & { logAmbiguous: boolean; frameAmbiguous: boolean } = {
        selectedLogId,
        selectedFrameId,
        hoverLogId,
        hoverFrameId,
        pinnedLogId,
        pinnedFrameId,
        syncMode,
        logAmbiguous,
        frameAmbiguous,
    };

    const actions: TimelineSyncActions = {
        selectLog: handleSelectLog,
        selectFrame: handleSelectFrame,
        hoverLog: handleHoverLog,
        hoverFrame: handleHoverFrame,
        pinLog: handlePinLog,
        pinFrame: handlePinFrame,
        clearPin: handleClearPin,
        navigateLog: handleNavigateLog,
        navigateFrame: handleNavigateFrame,
        setSyncMode,
    };

    return [state, actions, index];
}

export interface UseTimelineSyncReturn {
    state: TimelineSyncState & { logAmbiguous: boolean; frameAmbiguous: boolean };
    actions: TimelineSyncActions;
    index: TimelineIndex;
}