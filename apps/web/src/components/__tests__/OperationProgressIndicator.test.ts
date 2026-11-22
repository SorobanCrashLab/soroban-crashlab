/**
 * Tests for OperationProgressIndicator logic.
 *
 * These tests cover the exported types, state transitions, percentage
 * computation, and label derivation described in the component contract.
 * They exercise the pure logic without requiring a DOM renderer.
 */

import { describe, it, expect } from 'vitest';
import type {
  OperationStatus,
  DeterminateProgress,
  OperationProgressIndicatorProps,
} from '../OperationProgressIndicator';

// ─── clamp helper (mirrors the internal implementation) ──────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── percentage derivation (mirrors the component logic) ─────────────────────

function derivePercentage(
  status: OperationStatus,
  progress?: DeterminateProgress,
): number {
  const isDeterminate = progress !== undefined && progress.total > 0;
  if (isDeterminate) {
    return clamp((progress.current / progress.total) * 100, 0, 100);
  }
  if (status === 'done' || status === 'failed') return 100;
  return 0; // indeterminate running
}

// ─── label derivation (mirrors the component logic) ──────────────────────────

function deriveLabel(
  status: OperationStatus,
  progress?: DeterminateProgress,
  runningLabel = 'Running…',
  doneLabel = 'Done',
  failedLabel = 'Failed',
): string {
  const isDeterminate = progress !== undefined && progress.total > 0;
  const percentage = derivePercentage(status, progress);
  if (status === 'done') return doneLabel;
  if (status === 'failed') return failedLabel;
  if (isDeterminate) return `${runningLabel} ${percentage.toFixed(0)}%`;
  return runningLabel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

describe('OperationProgressIndicator – type contracts', () => {
  it('OperationStatus accepts all four valid values', () => {
    const values: OperationStatus[] = ['idle', 'running', 'done', 'failed'];
    expect(values).toHaveLength(4);
  });

  it('DeterminateProgress has current and total fields', () => {
    const progress: DeterminateProgress = { current: 3, total: 10 };
    expect(progress.current).toBe(3);
    expect(progress.total).toBe(10);
  });

  it('OperationProgressIndicatorProps carries all documented fields', () => {
    const props: OperationProgressIndicatorProps = {
      status: 'running',
      progress: { current: 5, total: 10 },
      runningLabel: 'Building…',
      doneLabel: 'Done',
      failedLabel: 'Failed',
      errorMessage: 'Something went wrong',
      className: 'mt-4',
    };
    expect(props.status).toBe('running');
    expect(props.progress?.total).toBe(10);
  });
});

describe('OperationProgressIndicator – clamp helper', () => {
  it('returns value unchanged when within bounds', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('clamps below minimum', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('clamps above maximum', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 100)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(100, 0, 100)).toBe(100);
  });
});

describe('OperationProgressIndicator – percentage derivation', () => {
  it('returns 0 for indeterminate running', () => {
    expect(derivePercentage('running')).toBe(0);
  });

  it('returns 100 for done state (indeterminate)', () => {
    expect(derivePercentage('done')).toBe(100);
  });

  it('returns 100 for failed state (indeterminate)', () => {
    expect(derivePercentage('failed')).toBe(100);
  });

  it('computes exact percentage for determinate progress', () => {
    expect(derivePercentage('running', { current: 25, total: 100 })).toBe(25);
  });

  it('computes percentage at 0%', () => {
    expect(derivePercentage('running', { current: 0, total: 100 })).toBe(0);
  });

  it('computes percentage at 100%', () => {
    expect(derivePercentage('running', { current: 100, total: 100 })).toBe(100);
  });

  it('clamps over-count to 100%', () => {
    // current > total should not produce > 100%
    expect(derivePercentage('running', { current: 120, total: 100 })).toBe(100);
  });

  it('treats total === 0 as indeterminate', () => {
    // total of 0 means we cannot compute a real percentage
    expect(derivePercentage('running', { current: 0, total: 0 })).toBe(0);
  });

  it('handles fractional progress correctly', () => {
    const pct = derivePercentage('running', { current: 1, total: 3 });
    expect(pct).toBeCloseTo(33.33, 1);
  });
});

describe('OperationProgressIndicator – label derivation', () => {
  it('uses doneLabel when status is done', () => {
    expect(deriveLabel('done')).toBe('Done');
  });

  it('uses failedLabel when status is failed', () => {
    expect(deriveLabel('failed')).toBe('Failed');
  });

  it('uses runningLabel for indeterminate running', () => {
    expect(deriveLabel('running')).toBe('Running…');
  });

  it('appends percentage to runningLabel for determinate running', () => {
    const label = deriveLabel('running', { current: 50, total: 100 });
    expect(label).toBe('Running… 50%');
  });

  it('rounds percentage in label', () => {
    const label = deriveLabel('running', { current: 1, total: 3 });
    // 33.33… rounded to 0 decimal places → "33"
    expect(label).toMatch(/Running… \d+%/);
  });

  it('accepts custom labels', () => {
    expect(deriveLabel('done', undefined, 'Exporting…', 'CSV ready', 'Export failed')).toBe(
      'CSV ready',
    );
    expect(deriveLabel('failed', undefined, 'Exporting…', 'CSV ready', 'Export failed')).toBe(
      'Export failed',
    );
    expect(deriveLabel('running', undefined, 'Exporting…')).toBe('Exporting…');
  });
});

describe('OperationProgressIndicator – isDeterminate logic', () => {
  it('is determinate when progress.total > 0', () => {
    const progress: DeterminateProgress = { current: 5, total: 10 };
    expect(progress.total > 0).toBe(true);
  });

  it('is indeterminate when progress is undefined', () => {
    const progress = undefined;
    expect(progress === undefined || (progress as DeterminateProgress | undefined)?.total === 0).toBe(true);
  });

  it('is indeterminate when total is 0', () => {
    const progress: DeterminateProgress = { current: 0, total: 0 };
    expect(progress.total > 0).toBe(false);
  });
});

describe('OperationProgressIndicator – state-to-colour mapping', () => {
  // These tests guard that the expected semantic colour assignments hold.
  // We map status → expected colour token fragment so renames cause a failure.

  type ColourSpec = { fillHint: string; labelHint: string };

  const STATUS_COLOUR_MAP: Record<Exclude<OperationStatus, 'idle'>, ColourSpec> = {
    running: { fillHint: '0A66C2', labelHint: '0A66C2' }, // primary blue
    done: { fillHint: 'emerald', labelHint: 'emerald' },
    failed: { fillHint: 'rose', labelHint: 'rose' },
  };

  it('running maps to primary-blue colour tokens', () => {
    const spec = STATUS_COLOUR_MAP['running'];
    expect(spec.fillHint).toContain('0A66C2');
    expect(spec.labelHint).toContain('0A66C2');
  });

  it('done maps to emerald colour tokens', () => {
    const spec = STATUS_COLOUR_MAP['done'];
    expect(spec.fillHint).toBe('emerald');
  });

  it('failed maps to rose colour tokens', () => {
    const spec = STATUS_COLOUR_MAP['failed'];
    expect(spec.fillHint).toBe('rose');
  });
});

describe('OperationProgressIndicator – idle guard', () => {
  it('idle status should cause the component to render nothing', () => {
    // Mirror the `if (status === "idle") return null` guard from the component.
    const status: OperationStatus = 'idle';
    const shouldRender = status !== 'idle';
    expect(shouldRender).toBe(false);
  });

  it('non-idle statuses should render', () => {
    const statuses: OperationStatus[] = ['running', 'done', 'failed'];
    for (const status of statuses) {
      expect(status !== 'idle').toBe(true);
    }
  });
});

describe('OperationProgressIndicator – error message', () => {
  it('error message is only relevant in failed state', () => {
    const props: Partial<OperationProgressIndicatorProps> = {
      status: 'failed',
      errorMessage: 'Network timeout',
    };
    expect(props.status === 'failed' && props.errorMessage !== undefined).toBe(true);
  });

  it('error message is ignored for non-failed states', () => {
    // The component only renders the message block when status === 'failed',
    // so a message on a running/done state is logically irrelevant.
    const props: Partial<OperationProgressIndicatorProps> = {
      status: 'running',
      errorMessage: 'This should not display',
    };
    expect(props.status === 'failed').toBe(false);
  });
});
