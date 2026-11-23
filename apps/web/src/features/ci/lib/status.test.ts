import { describe, expect, it } from 'vitest';
import type { CiCheck, CiRun } from './model';
import {
  checkStatus,
  isBlockingCheck,
  normalizeConclusion,
  rollupStatus,
  runStatus,
  selectLatestRuns,
} from './status';

function run(id: string, overrides: Partial<CiRun> = {}): CiRun {
  return {
    id,
    workflowName: 'CI',
    event: 'push',
    branch: 'main',
    commitSha: 'a'.repeat(40),
    commitMessage: 'test',
    author: 'dev',
    attempt: 1,
    status: 'completed',
    conclusion: 'success',
    createdAt: '2026-11-23T08:00:00.000Z',
    updatedAt: '2026-11-23T08:10:00.000Z',
    durationMs: 1_000,
    jobs: [],
    checks: [],
    artifacts: [],
    metrics: [],
    codeAreas: ['web'],
    ...overrides,
  };
}

const check = (conclusion: string | null, required: boolean): CiCheck => ({
  id: `chk-${conclusion}-${required}`,
  name: 'required',
  conclusion,
  status: 'completed',
  required,
});

describe('normalizeConclusion', () => {
  it('maps common provider conclusions', () => {
    expect(normalizeConclusion('success')).toBe('pass');
    expect(normalizeConclusion('failure')).toBe('fail');
    expect(normalizeConclusion('timed_out')).toBe('fail');
    expect(normalizeConclusion('neutral')).toBe('warn');
    expect(normalizeConclusion('action_required')).toBe('warn');
    expect(normalizeConclusion('cancelled')).toBe('skip');
    expect(normalizeConclusion('skipped')).toBe('skip');
  });

  it('treats null as pending for active jobs and skip for completed ones', () => {
    expect(normalizeConclusion(null, 'in_progress')).toBe('pending');
    expect(normalizeConclusion(null, 'completed')).toBe('skip');
  });

  it('fails closed on unknown conclusions as a warning', () => {
    expect(normalizeConclusion('brand_new_state')).toBe('warn');
  });
});

describe('checkStatus / isBlockingCheck', () => {
  it('promotes skipped or cancelled required checks to failures', () => {
    expect(checkStatus(check('cancelled', true))).toBe('fail');
    expect(isBlockingCheck(check('skipped', true))).toBe(true);
    expect(isBlockingCheck(check('success', true))).toBe(false);
    expect(isBlockingCheck(check('failure', false))).toBe(false);
  });
});

describe('rollupStatus / runStatus', () => {
  it('lets failures win over pending, warnings and skips', () => {
    expect(rollupStatus(['skip', 'pass', 'warn', 'pending', 'fail'])).toBe('fail');
    expect(rollupStatus(['skip', 'pass', 'warn'])).toBe('warn');
    expect(rollupStatus(['skip'])).toBe('skip');
    expect(rollupStatus([])).toBe('skip');
  });

  it('includes jobs and required checks in the run rollup', () => {
    expect(
      runStatus(
        run('r1', {
          jobs: [
            {
              id: 'j1',
              name: 'lint',
              workflowName: 'CI',
              status: 'completed',
              conclusion: 'success',
              durationMs: 10,
              steps: [],
              artifacts: [],
              gates: ['lint'],
            },
          ],
          checks: [check('cancelled', true)],
        }),
      ),
    ).toBe('fail');
  });
});

describe('selectLatestRuns', () => {
  it('picks the highest rerun attempt regardless of timestamps', () => {
    const older = run('old', {
      attempt: 1,
      conclusion: 'failure',
      updatedAt: '2026-11-23T09:00:00.000Z',
    });
    const newer = run('new', {
      attempt: 2,
      rerunOf: 'old',
      conclusion: 'success',
      updatedAt: '2026-11-23T08:00:00.000Z',
    });
    const other = run('other', { updatedAt: '2026-11-23T10:00:00.000Z' });
    const { latest, history } = selectLatestRuns([older, newer, other]);
    expect(latest.map((item) => item.id)).toEqual(['other', 'new']);
    expect(history.new.map((item) => item.id)).toEqual(['old']);
  });

  it('breaks attempt ties by update time then id', () => {
    const a = run('a', { attempt: 2, rerunOf: 'base', updatedAt: '2026-11-23T08:00:00.000Z' });
    const b = run('b', { attempt: 2, rerunOf: 'base', updatedAt: '2026-11-23T09:00:00.000Z' });
    const { latest } = selectLatestRuns([a, b]);
    expect(latest).toHaveLength(1);
    expect(latest[0].id).toBe('b');
  });
});
