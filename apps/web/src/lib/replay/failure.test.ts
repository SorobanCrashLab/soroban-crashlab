import { describe, expect, it } from 'vitest';
import {
  classifyReplayFailure,
  describeReplayFailure,
  isRunnerUnavailableError,
} from './failure';

describe('replay failure taxonomy', () => {
  it('gives every reason its own copy and retry verdict', () => {
    const bundle = describeReplayFailure('bundle-missing');
    const runner = describeReplayFailure('runner-unavailable');
    const mismatch = describeReplayFailure('mismatch');

    expect(bundle.title).not.toBe(runner.title);
    expect(bundle.retryable).toBe(false);
    expect(runner.retryable).toBe(false);
    expect(mismatch.guidance).toMatch(/issue/i);
  });

  it('appends detail to the message without replacing guidance', () => {
    const failure = describeReplayFailure('internal', 'segmentation fault');
    expect(failure.message).toContain('segmentation fault');
    expect(failure.guidance.length).toBeGreaterThan(0);
  });

  it('only appends non-blank detail', () => {
    expect(describeReplayFailure('internal', '   ').message).toBe(
      describeReplayFailure('internal').message,
    );
  });

  it('recognises ENOENT and ENOTDIR as a missing runner', () => {
    expect(isRunnerUnavailableError({ code: 'ENOENT' })).toBe(true);
    expect(isRunnerUnavailableError({ code: 'ENOTDIR' })).toBe(true);
    expect(isRunnerUnavailableError({ code: 'EACCES' })).toBe(false);
    expect(isRunnerUnavailableError(new Error('nope'))).toBe(false);
    expect(isRunnerUnavailableError(null)).toBe(false);
  });

  it('returns null for a clean exit', () => {
    expect(classifyReplayFailure({ exitCode: 0, stderr: '' })).toBeNull();
  });

  it('classifies structured signals in priority order', () => {
    expect(
      classifyReplayFailure({ environmentMismatch: true, bundleMissing: true, exitCode: 1 })?.reason,
    ).toBe('environment-mismatch');
    expect(classifyReplayFailure({ bundleMissing: true, runnerMissing: true })?.reason).toBe(
      'bundle-missing',
    );
    expect(classifyReplayFailure({ runnerMissing: true, timedOut: true })?.reason).toBe(
      'runner-unavailable',
    );
    expect(classifyReplayFailure({ timedOut: true })?.reason).toBe('timeout');
  });

  it('recognises a signature mismatch in stderr', () => {
    expect(classifyReplayFailure({ exitCode: 1, stderr: 'replay mismatch: sig a != sig b' })?.reason).toBe(
      'mismatch',
    );
    expect(classifyReplayFailure({ exitCode: 0, stderr: 'Signature Mismatch detected' })?.reason).toBe(
      'mismatch',
    );
  });

  it('falls back to internal for an unexplained non-zero exit', () => {
    const failure = classifyReplayFailure({ exitCode: 2, stderr: '  boom  ' });
    expect(failure?.reason).toBe('internal');
    expect(failure?.message).toContain('boom');
    expect(failure?.retryable).toBe(true);
  });

  it('truncates a huge stderr tail', () => {
    const failure = classifyReplayFailure({ exitCode: 1, stderr: 'e'.repeat(2_000) });
    expect(failure?.message.length).toBeLessThan(600);
  });
});
