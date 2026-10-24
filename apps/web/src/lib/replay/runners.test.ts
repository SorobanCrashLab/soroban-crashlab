import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPLAY_RUNNER,
  REPLAY_RUNNERS,
  REPLAY_RUNNER_INFO,
  isReplayRunner,
  parseReplayRunner,
} from './runners';

describe('replay runners', () => {
  it('exposes exactly the three supported modes', () => {
    expect([...REPLAY_RUNNERS]).toEqual(['mock', 'host', 'rpc-sim']);
    for (const runner of REPLAY_RUNNERS) {
      expect(REPLAY_RUNNER_INFO[runner].id).toBe(runner);
      expect(REPLAY_RUNNER_INFO[runner].label.length).toBeGreaterThan(0);
    }
  });

  it('marks only the real engine runners as executing the engine', () => {
    expect(REPLAY_RUNNER_INFO.mock.executesEngine).toBe(false);
    expect(REPLAY_RUNNER_INFO.host.executesEngine).toBe(true);
    expect(REPLAY_RUNNER_INFO['rpc-sim'].executesEngine).toBe(true);
  });

  it('recognises known runner ids', () => {
    expect(isReplayRunner('mock')).toBe(true);
    expect(isReplayRunner('rpc-sim')).toBe(true);
    expect(isReplayRunner('MOCK')).toBe(false);
    expect(isReplayRunner(undefined)).toBe(false);
  });

  it('defaults when the value is absent or blank', () => {
    expect(parseReplayRunner(undefined)).toBe(DEFAULT_REPLAY_RUNNER);
    expect(parseReplayRunner(null)).toBe(DEFAULT_REPLAY_RUNNER);
    expect(parseReplayRunner('   ')).toBe(DEFAULT_REPLAY_RUNNER);
  });

  it('accepts and trims a known runner', () => {
    expect(parseReplayRunner('  rpc-sim ')).toBe('rpc-sim');
  });

  it('rejects an unknown runner instead of silently falling back', () => {
    expect(parseReplayRunner('docker')).toBeNull();
    expect(parseReplayRunner('MOCK')).toBeNull();
    expect(parseReplayRunner(42)).toBeNull();
  });
});
