/** Alert engine tests (#2206). */
import { describe, expect, it } from 'vitest';
import { AlertEngine } from './AlertEngine';

const summary = (value: number) => ({
  count: 1,
  current: value,
  average: value,
  min: value,
  max: value,
  ratePerSecond: 0,
});

describe('AlertEngine', () => {
  const rules = [{ id: 'crash-rate', metric: 'crashRate', warning: 2, critical: 5, consecutive: 2 }];

  it('stays healthy below thresholds', () => {
    const engine = new AlertEngine(rules);
    expect(engine.evaluate({ crashRate: summary(1) })[0]).toMatchObject({ state: 'healthy', value: 1 });
  });

  it('requires consecutive breaches before escalating', () => {
    const engine = new AlertEngine(rules);
    expect(engine.evaluate({ crashRate: summary(6) })[0].state).toBe('healthy');
    expect(engine.evaluate({ crashRate: summary(6) })[0]).toMatchObject({ state: 'critical' });
  });

  it('escalates to warning and clears immediately', () => {
    const engine = new AlertEngine([{ id: 'queue', metric: 'queue', warning: 10, critical: 100 }]);
    expect(engine.evaluate({ queue: summary(12) })[0].state).toBe('warning');
    expect(engine.evaluate({ queue: summary(0) })[0].state).toBe('healthy');
    expect(engine.evaluate({})[0].state).toBe('healthy');
  });
});
