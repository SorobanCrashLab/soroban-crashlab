/**
 * Timeline Sync Index Builder - correlates log entries with sequence diagram frames.
 * Provides bidirectional navigation between log scrubber and sequence diagram.
 */


export interface LogEntry {
    id: string;
    timestamp: number; // ISO timestamp as number
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    runId: string;
    stepId?: string; // correlation to sequence step
    sequenceOrder?: number;
}

export interface SequenceFrame {
    id: string;
    order: number;
    caller: string;
    callee: string;
    method: string;
    status: 'ok' | 'error' | 'pending';
    durationMs: number;
    timestamp?: number; // estimated timestamp
    logEntryIds?: string[]; // correlated log entries
}

export interface TimelineIndex {
    logEntries: Map<string, LogEntry>;
    sequenceFrames: Map<string, SequenceFrame>;
    // Correlation mapping: logEntryId -> sequenceFrameId
    logToSequence: Map<string, string>;
    sequenceToLogs: Map<string, string[]>;
    // Timeline ordering
    orderedLogIds: string[];
    orderedSequenceIds: string[];
}

export interface CorrelationConfig {
    epsilonMs: number; // tolerance for timestamp matching
    useSequenceOrder: boolean; // prefer sequence order over timestamps
}

/**
 * Default correlation configuration.
 * epsilon: 100ms tolerance for clock skew between logs and sequence frames.
 */
export const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
    epsilonMs: 100,
    useSequenceOrder: true,
};

/**
 * Builds a timeline index from log entries and sequence frames.
 * Correlates entries by timestamp/sequence order with tolerance matching.
 * Ambiguous mappings are marked (both views show joined indicator).
 */
export function buildTimelineIndex(
    logEntries: LogEntry[],
    sequenceFrames: SequenceFrame[],
    config: CorrelationConfig = DEFAULT_CORRELATION_CONFIG
): TimelineIndex {
    const logMap = new Map<string, LogEntry>();
    const sequenceMap = new Map<string, SequenceFrame>();
    const logToSequence = new Map<string, string>();
    const sequenceToLogs = new Map<string, string[]>();

    // Build lookup maps
    for (const entry of logEntries) {
        logMap.set(entry.id, entry);
    }
    for (const frame of sequenceFrames) {
        sequenceMap.set(frame.id, frame);
    }

    // Sort by timestamp for timeline ordering
    const sortedLogs = [...logEntries].sort((a, b) => a.timestamp - b.timestamp);
    const sortedFrames = [...sequenceFrames].sort((a, b) => a.order - b.order);

    const orderedLogIds = sortedLogs.map(e => e.id);
    const orderedSequenceIds = sortedFrames.map(f => f.id);

    // Correlation strategy:
    // 1. If log has explicit stepId/sequenceOrder, use direct mapping
    // 2. Otherwise, correlate by timestamp within epsilon tolerance
    // 3. Fallback to sequence order alignment

    // First pass: explicit correlations
    for (const entry of logEntries) {
        if (entry.stepId && sequenceMap.has(entry.stepId)) {
            logToSequence.set(entry.id, entry.stepId);
            const existing = sequenceToLogs.get(entry.stepId) || [];
            existing.push(entry.id);
            sequenceToLogs.set(entry.stepId, existing);
        } else if (entry.sequenceOrder !== undefined) {
            const frame = sortedFrames.find(f => f.order === entry.sequenceOrder);
            if (frame) {
                logToSequence.set(entry.id, frame.id);
                const existing = sequenceToLogs.get(frame.id) || [];
                existing.push(entry.id);
                sequenceToLogs.set(frame.id, existing);
            }
        }
    }

    // Second pass: timestamp-based correlation for unmatched logs
    const unmatchedLogs = logEntries.filter(e => !logToSequence.has(e.id));
    
    for (const entry of unmatchedLogs) {
        // Find closest sequence frame by timestamp
        let bestMatch: SequenceFrame | null = null;
        let bestDiff = config.epsilonMs + 1;

        for (const frame of sortedFrames) {
            if (!frame.timestamp) continue;
            const diff = Math.abs(entry.timestamp - frame.timestamp);
            if (diff < bestDiff && diff <= config.epsilonMs) {
                bestDiff = diff;
                bestMatch = frame;
            }
        }

        if (bestMatch) {
            logToSequence.set(entry.id, bestMatch.id);
            const existing = sequenceToLogs.get(bestMatch.id) || [];
            existing.push(entry.id);
            sequenceToLogs.set(bestMatch.id, existing);
        }
    }

    // Third pass: sequence order alignment for remaining unmatched
    const stillUnmatched = unmatchedLogs.filter(e => !logToSequence.has(e.id));
    
    if (config.useSequenceOrder && stillUnmatched.length > 0 && sortedFrames.length > 0) {
        // Distribute unmatched logs proportionally across sequence frames
        for (let i = 0; i < stillUnmatched.length; i++) {
            const frameIdx = Math.min(
                Math.floor((i / stillUnmatched.length) * sortedFrames.length),
                sortedFrames.length - 1
            );
            const frame = sortedFrames[frameIdx];
            const entry = stillUnmatched[i];
            logToSequence.set(entry.id, frame.id);
            const existing = sequenceToLogs.get(frame.id) || [];
            existing.push(entry.id);
            sequenceToLogs.set(frame.id, existing);
        }
    }

    return {
        logEntries: logMap,
        sequenceFrames: sequenceMap,
        logToSequence,
        sequenceToLogs,
        orderedLogIds,
        orderedSequenceIds,
    };
}

/**
 * Gets the sequence frame correlated to a log entry.
 */
export function getCorrelatedFrame(index: TimelineIndex, logEntryId: string): SequenceFrame | null {
    const frameId = index.logToSequence.get(logEntryId);
    if (!frameId) return null;
    return index.sequenceFrames.get(frameId) || null;
}

/**
 * Gets the log entries correlated to a sequence frame.
 */
export function getCorrelatedLogs(index: TimelineIndex, frameId: string): LogEntry[] {
    const logIds = index.sequenceToLogs.get(frameId) || [];
    return logIds.map(id => index.logEntries.get(id)).filter(Boolean) as LogEntry[];
}

/**
 * Finds the log index for a given timestamp (nearest neighbor).
 */
export function findLogByTimestamp(index: TimelineIndex, timestamp: number): LogEntry | null {
    if (index.orderedLogIds.length === 0) return null;
    
    let left = 0;
    let right = index.orderedLogIds.length - 1;
    let best = index.orderedLogIds[0];
    let bestDiff = Math.abs(index.logEntries.get(best)!.timestamp - timestamp);

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const id = index.orderedLogIds[mid];
        const entry = index.logEntries.get(id)!;
        const diff = Math.abs(entry.timestamp - timestamp);

        if (diff < bestDiff) {
            bestDiff = diff;
            best = id;
        }

        if (entry.timestamp < timestamp) {
            left = mid + 1;
        } else if (entry.timestamp > timestamp) {
            right = mid - 1;
        } else {
            return entry;
        }
    }

    return index.logEntries.get(best) || null;
}

/**
 * Finds the sequence frame for a given order.
 */
export function findFrameByOrder(index: TimelineIndex, order: number): SequenceFrame | null {
    for (const frame of index.sequenceFrames.values()) {
        if (frame.order === order) return frame;
    }
    return null;
}

/**
 * Gets the next/previous log entry in timeline order.
 */
export function getAdjacentLog(
    index: TimelineIndex,
    logEntryId: string,
    direction: 'next' | 'prev'
): LogEntry | null {
    const idx = index.orderedLogIds.indexOf(logEntryId);
    if (idx === -1) return null;

    const newIdx = direction === 'next' ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= index.orderedLogIds.length) return null;

    return index.logEntries.get(index.orderedLogIds[newIdx]) || null;
}

/**
 * Gets the next/previous sequence frame in order.
 */
export function getAdjacentFrame(
    index: TimelineIndex,
    frameId: string,
    direction: 'next' | 'prev'
): SequenceFrame | null {
    const idx = index.orderedSequenceIds.indexOf(frameId);
    if (idx === -1) return null;

    const newIdx = direction === 'next' ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= index.orderedSequenceIds.length) return null;

    return index.sequenceFrames.get(index.orderedSequenceIds[newIdx]) || null;
}

/**
 * Checks if a log-sequence mapping is ambiguous (multiple logs mapped to same frame or vice versa).
 */
export function isMappingAmbiguous(index: TimelineIndex, logEntryId: string): boolean {
    const frameId = index.logToSequence.get(logEntryId);
    if (!frameId) return false;
    
    const logCount = index.sequenceToLogs.get(frameId)?.length || 0;
    return logCount > 1;
}

/**
 * Checks if a sequence frame has ambiguous log mappings.
 */
export function isFrameMappingAmbiguous(index: TimelineIndex, frameId: string): boolean {
    const logCount = index.sequenceToLogs.get(frameId)?.length || 0;
    return logCount > 1;
}

/**
 * Builds mock timeline data for testing/development.
 */
export function buildMockTimelineIndex(runId: string): TimelineIndex {
    const baseTime = Date.now() - 3600000; // 1 hour ago

    // Mock log entries
    const logs: LogEntry[] = [
        { id: `${runId}-log-1`, timestamp: baseTime + 0, level: 'info', message: 'Run started', runId },
        { id: `${runId}-log-2`, timestamp: baseTime + 100, level: 'debug', message: 'Invoking token.transfer', runId, stepId: `${runId}-step-1` },
        { id: `${runId}-log-3`, timestamp: baseTime + 150, level: 'debug', message: 'Auth check passed', runId, stepId: `${runId}-step-2` },
        { id: `${runId}-log-4`, timestamp: baseTime + 200, level: 'debug', message: 'Reading balance', runId, stepId: `${runId}-step-3` },
        { id: `${runId}-log-5`, timestamp: baseTime + 250, level: 'debug', message: 'Writing balance', runId, stepId: `${runId}-step-4` },
        { id: `${runId}-log-6`, timestamp: baseTime + 300, level: 'info', message: 'Transfer completed', runId, stepId: `${runId}-step-5` },
        { id: `${runId}-log-7`, timestamp: baseTime + 350, level: 'info', message: 'Run completed', runId },
    ];

    // Mock sequence frames
    const frames: SequenceFrame[] = [
        { id: `${runId}-step-1`, order: 1, caller: 'Invoker', callee: 'token', method: 'transfer', status: 'ok', durationMs: 12, timestamp: baseTime + 100 },
        { id: `${runId}-step-2`, order: 2, caller: 'token', callee: 'auth', method: 'require_auth', status: 'ok', durationMs: 8, timestamp: baseTime + 150 },
        { id: `${runId}-step-3`, order: 3, caller: 'token', callee: 'ledger', method: 'get_balance', status: 'ok', durationMs: 15, timestamp: baseTime + 200 },
        { id: `${runId}-step-4`, order: 4, caller: 'token', callee: 'ledger', method: 'set_balance', status: 'ok', durationMs: 20, timestamp: baseTime + 250 },
        { id: `${runId}-step-5`, order: 5, caller: 'token', callee: 'events', method: 'publish', status: 'ok', durationMs: 10, timestamp: baseTime + 300 },
    ];

    return buildTimelineIndex(logs, frames);
}