import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metrics, datadogClient } from '../datadog';

vi.mock('hot-shots', () => {
  return {
    StatsD: vi.fn().mockImplementation(() => {
      return {
        increment: vi.fn(),
        histogram: vi.fn(),
        gauge: vi.fn()
      };
    })
  };
});

describe('Datadog Metrics Export Layer Spec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should format and forward increments to the StatsD client engine safely', () => {
    const spy = vi.spyOn(datadogClient, 'increment');
    metrics.increment('lab.executed', ['lab_id:crashcourse']);
    
    expect(spy).toHaveBeenCalledWith('lab.executed', 1, ['lab_id:crashcourse']);
  });

  it('should accept histograms for structural runtime latency monitoring records', () => {
    const spy = vi.spyOn(datadogClient, 'histogram');
    metrics.histogram('rpc.request.duration', 245, ['method:getLatestLedger']);
    
    expect(spy).toHaveBeenCalledWith('rpc.request.duration', 245, ['method:getLatestLedger']);
  });
});