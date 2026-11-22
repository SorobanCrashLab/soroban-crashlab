/** Regression lifecycle tests (#2207). */
import { describe, expect, it } from 'vitest';
import { RegressionStateMachine, canTransition } from './RegressionStateMachine';

describe('regression lifecycle', () => {
  it('follows the full detection to verification path', () => {
    const machine = new RegressionStateMachine('reg-1');
    expect(machine.state).toBe('detected');
    expect(machine.transition('bisecting', 'bot', 1)).toBe('bisecting');
    expect(machine.transition('bisected', 'bot', 2)).toBe('bisected');
    expect(machine.transition('fixing', 'alice', 3)).toBe('fixing');
    expect(machine.transition('fixed', 'alice', 4)).toBe('fixed');
    expect(machine.transition('verified', 'bot', 5)).toBe('verified');
    expect(machine.history).toHaveLength(5);
    expect(machine.history[0]).toEqual({ from: 'detected', to: 'bisecting', actor: 'bot', at: 1 });
  });

  it('rejects invalid transitions', () => {
    const machine = new RegressionStateMachine('reg-2');
    expect(() => machine.transition('verified', 'bot')).toThrow(/Invalid transition/);
    expect(canTransition('fixed', 'verified')).toBe(true);
    expect(canTransition('verified', 'fixed')).toBe(false);
  });
});
