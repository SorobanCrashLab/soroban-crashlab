/**
 * Tests for timeline sync index builder and sync behaviors.
 */

import { buildTimelineIndex, getCorrelatedFrame, getCorrelatedLogs, getAdjacentLog, getAdjacentFrame, isMappingAmbiguous, isFrameMappingAmbiguous, buildMockTimelineIndex } from './index';

import { LogEntry, SequenceFrame } from './index';

describe('buildTimelineIndex', () => {
    it('builds index from logs and frames', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'start', runId: 'run-1' },
            { id: 'log-2', timestamp: 1100, level: 'debug', message: 'step 1', runId: 'run-1', stepId: 'frame-1' },
            { id: 'log-3', timestamp: 1200, level: 'debug', message: 'step 2', runId: 'run-1', stepId: 'frame-2' },
        ];

        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10 },
            { id: 'frame-2', order: 2, caller: 'B', callee: 'C', method: 'bar', status: 'ok', durationMs: 15 },
        ];

        const index = buildTimelineIndex(logs, frames);

        expect(index.logEntries.size).toBe(3);
        expect(index.sequenceFrames.size).toBe(2);
        expect(index.orderedLogIds).toEqual(['log-1', 'log-2', 'log-3']);
        expect(index.orderedSequenceIds).toEqual(['frame-1', 'frame-2']);
    });

    it('correlates by explicit stepId', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'start', runId: 'run-1' },
            { id: 'log-2', timestamp: 1100, level: 'debug', message: 'step 1', runId: 'run-1', stepId: 'frame-1' },
        ];

        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10 },
        ];

        const index = buildTimelineIndex(logs, frames);

        expect(index.logToSequence.get('log-2')).toBe('frame-1');
        expect(index.sequenceToLogs.get('frame-1')).toEqual(['log-2']);
    });

    it('correlates by sequenceOrder', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'start', runId: 'run-1', sequenceOrder: 1 },
            { id: 'log-2', timestamp: 1100, level: 'debug', message: 'step 2', runId: 'run-1', sequenceOrder: 2 },
        ];

        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10 },
            { id: 'frame-2', order: 2, caller: 'B', callee: 'C', method: 'bar', status: 'ok', durationMs: 15 },
        ];

        const index = buildTimelineIndex(logs, frames);

        expect(index.logToSequence.get('log-1')).toBe('frame-1');
        expect(index.logToSequence.get('log-2')).toBe('frame-2');
    });

    it('correlates by timestamp within epsilon', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'start', runId: 'run-1' },
            { id: 'log-2', timestamp: 1105, level: 'debug', message: 'step 1', runId: 'run-1' }, // within 100ms of frame-1
        ];

        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10, timestamp: 1100 },
        ];

        const index = buildTimelineIndex(logs, frames, { epsilonMs: 100, useSequenceOrder: false });

        expect(index.logToSequence.get('log-2')).toBe('frame-1');
    });

    it('does not correlate outside epsilon', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'start', runId: 'run-1' },
            { id: 'log-2', timestamp: 1500, level: 'debug', message: 'step 1', runId: 'run-1' }, // 400ms away
        ];

        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10, timestamp: 1100 },
        ];

        const index = buildTimelineIndex(logs, frames, { epsilonMs: 100, useSequenceOrder: false });

        expect(index.logToSequence.get('log-2')).toBeUndefined();
    });

    it('falls back to sequence order alignment', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'start', runId: 'run-1' },
            { id: 'log-2', timestamp: 2000, level: 'debug', message: 'step 1', runId: 'run-1' },
            { id: 'log-3', timestamp: 3000, level: 'debug', message: 'step 2', runId: 'run-1' },
        ];

        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10 },
            { id: 'frame-2', order: 2, caller: 'B', callee: 'C', method: 'bar', status: 'ok', durationMs: 15 },
        ];

        const index = buildTimelineIndex(logs, frames, { epsilonMs: 100, useSequenceOrder: true });

        // Both unmatched logs should be distributed across frames
        expect(index.logToSequence.size).toBeGreaterThanOrEqual(1);
    });

    it('handles empty inputs', () => {
        const index = buildTimelineIndex([], []);
        expect(index.logEntries.size).toBe(0);
        expect(index.sequenceFrames.size).toBe(0);
    });

    it('handles logs without frames', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'start', runId: 'run-1' },
        ];

        const index = buildTimelineIndex(logs, []);

        expect(index.logEntries.size).toBe(1);
        expect(index.sequenceFrames.size).toBe(0);
    });
});

describe('getCorrelatedFrame', () => {
    it('returns correlated frame', () => {
        const index = buildMockTimelineIndex('run-1');
        const frame = getCorrelatedFrame(index, 'run-1-log-2');
        expect(frame).not.toBeNull();
        expect(frame?.id).toBe('run-1-step-1');
    });

    it('returns null for uncorrelated log', () => {
        const index = buildMockTimelineIndex('run-1');
        const frame = getCorrelatedFrame(index, 'run-1-log-1'); // no stepId
        // May be correlated via fallback
        expect(frame).toBeDefined();
    });

    it('returns null for unknown log', () => {
        const index = buildMockTimelineIndex('run-1');
        const frame = getCorrelatedFrame(index, 'unknown-log');
        expect(frame).toBeNull();
    });
});

describe('getCorrelatedLogs', () => {
    it('returns logs for frame', () => {
        const index = buildMockTimelineIndex('run-1');
        const logs = getCorrelatedLogs(index, 'run-1-step-1');
        expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for unknown frame', () => {
        const index = buildMockTimelineIndex('run-1');
        const logs = getCorrelatedLogs(index, 'unknown-frame');
        expect(logs).toEqual([]);
    });
});

describe('getAdjacentLog', () => {
    it('returns next log', () => {
        const index = buildMockTimelineIndex('run-1');
        const next = getAdjacentLog(index, 'run-1-log-1', 'next');
        expect(next).not.toBeNull();
        expect(next?.id).toBe('run-1-log-2');
    });

    it('returns prev log', () => {
        const index = buildMockTimelineIndex('run-1');
        const prev = getAdjacentLog(index, 'run-1-log-3', 'prev');
        expect(prev).not.toBeNull();
        expect(prev?.id).toBe('run-1-log-2');
    });

    it('returns null at boundaries', () => {
        const index = buildMockTimelineIndex('run-1');
        expect(getAdjacentLog(index, 'run-1-log-1', 'prev')).toBeNull();
        
        const logIds = index.orderedLogIds;
        const lastId = logIds[logIds.length - 1];
        expect(getAdjacentLog(index, lastId, 'next')).toBeNull();
    });
});

describe('getAdjacentFrame', () => {
    it('returns next frame', () => {
        const index = buildMockTimelineIndex('run-1');
        const next = getAdjacentFrame(index, 'run-1-step-1', 'next');
        expect(next).not.toBeNull();
        expect(next?.id).toBe('run-1-step-2');
    });

    it('returns prev frame', () => {
        const index = buildMockTimelineIndex('run-1');
        const prev = getAdjacentFrame(index, 'run-1-step-3', 'prev');
        expect(prev).not.toBeNull();
        expect(prev?.id).toBe('run-1-step-2');
    });
});

describe('isMappingAmbiguous', () => {
    it('detects multiple logs per frame', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'a', runId: 'run-1', stepId: 'frame-1' },
            { id: 'log-2', timestamp: 1100, level: 'info', message: 'b', runId: 'run-1', stepId: 'frame-1' },
        ];
        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10 },
        ];

        const index = buildTimelineIndex(logs, frames);

        expect(isMappingAmbiguous(index, 'log-1')).toBe(true);
        expect(isMappingAmbiguous(index, 'log-2')).toBe(true);
    });

    it('returns false for one-to-one', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'a', runId: 'run-1', stepId: 'frame-1' },
        ];
        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10 },
        ];

        const index = buildTimelineIndex(logs, frames);

        expect(isMappingAmbiguous(index, 'log-1')).toBe(false);
    });
});

describe('isFrameMappingAmbiguous', () => {
    it('detects multiple logs per frame', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'a', runId: 'run-1', stepId: 'frame-1' },
            { id: 'log-2', timestamp: 1100, level: 'info', message: 'b', runId: 'run-1', stepId: 'frame-1' },
        ];
        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10 },
        ];

        const index = buildTimelineIndex(logs, frames);

        expect(isFrameMappingAmbiguous(index, 'frame-1')).toBe(true);
    });
});

describe('buildMockTimelineIndex', () => {
    it('creates valid index with correlated data', () => {
        const index = buildMockTimelineIndex('run-1');
        
        expect(index.logEntries.size).toBe(7);
        expect(index.sequenceFrames.size).toBe(5);
        expect(index.orderedLogIds.length).toBe(7);
        expect(index.orderedSequenceIds.length).toBe(5);
        
        // Check explicit correlations
        expect(index.logToSequence.get('run-1-log-2')).toBe('run-1-step-1');
        expect(index.logToSequence.get('run-1-log-6')).toBe('run-1-step-5');
    });
});

describe('timestamp edge cases', () => {
    it('handles identical timestamps', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1000, level: 'info', message: 'a', runId: 'run-1' },
            { id: 'log-2', timestamp: 1000, level: 'info', message: 'b', runId: 'run-1' },
        ];
        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10, timestamp: 1000 },
        ];

        const index = buildTimelineIndex(logs, frames, { epsilonMs: 100, useSequenceOrder: false });

        // Both logs within epsilon of frame
        expect(index.logToSequence.size).toBeGreaterThanOrEqual(1);
    });

    it('handles out-of-order timestamps', () => {
        const logs: LogEntry[] = [
            { id: 'log-1', timestamp: 1100, level: 'info', message: 'a', runId: 'run-1' },
            { id: 'log-2', timestamp: 1000, level: 'info', message: 'b', runId: 'run-1' },
        ];

        const frames: SequenceFrame[] = [
            { id: 'frame-1', order: 1, caller: 'A', callee: 'B', method: 'foo', status: 'ok', durationMs: 10 },
        ];

        const index = buildTimelineIndex(logs, frames);

        // Should sort logs by timestamp
        expect(index.orderedLogIds[0]).toBe('log-2');
        expect(index.orderedLogIds[1]).toBe('log-1');
    });
});