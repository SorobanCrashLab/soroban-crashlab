// Issue #1844: RED metrics (Rate, Errors, Duration) per route

interface RouteMetrics {
  requestCount: number;
  errorCount: number;
  durations: number[];
}

class MetricsCollector {
  private metrics: Map<string, RouteMetrics> = new Map();

  recordRequest(route: string, durationMs: number, isError: boolean): void {
    const existing = this.metrics.get(route) || {
      requestCount: 0,
      errorCount: 0,
      durations: [],
    };

    existing.requestCount++;
    if (isError) existing.errorCount++;
    existing.durations.push(durationMs);

    // Keep only last 1000 durations for p50/p95/p99 calculation
    if (existing.durations.length > 1000) {
      existing.durations = existing.durations.slice(-1000);
    }

    this.metrics.set(route, existing);
  }

  getMetrics(route: string): RouteMetrics | undefined {
    return this.metrics.get(route);
  }

  getAllMetrics(): Record<string, {
    requestCount: number;
    errorCount: number;
    errorRate: number;
    p50: number;
    p95: number;
    p99: number;
  }> {
    const result: Record<string, ReturnType<MetricsCollector['getAllMetrics']>[string]> = {};

    for (const [route, metrics] of this.metrics.entries()) {
      const sorted = [...metrics.durations].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

      result[route] = {
        requestCount: metrics.requestCount,
        errorCount: metrics.errorCount,
        errorRate: metrics.requestCount > 0 
          ? metrics.errorCount / metrics.requestCount 
          : 0,
        p50,
        p95,
        p99,
      };
    }

    return result;
  }

  // Prometheus-compatible format
  toPrometheusFormat(): string {
    const lines: string[] = [];
    
    for (const [route, data] of Object.entries(this.getAllMetrics())) {
      const sanitizedRoute = route.replace(/[^a-zA-Z0-9_]/g, '_');
      
      lines.push(`# HELP crashlab_requests_total Total number of requests`);
      lines.push(`# TYPE crashlab_requests_total counter`);
      lines.push(`crashlab_requests_total{route="${route}"} ${data.requestCount}`);
      
      lines.push(`# HELP crashlab_errors_total Total number of errors`);
      lines.push(`# TYPE crashlab_errors_total counter`);
      lines.push(`crashlab_errors_total{route="${route}"} ${data.errorCount}`);
      
      lines.push(`# HELP crashlab_duration_ms Request duration percentiles`);
      lines.push(`# TYPE crashlab_duration_ms histogram`);
      lines.push(`crashlab_duration_ms{route="${route}",quantile="0.5"} ${data.p50}`);
      lines.push(`crashlab_duration_ms{route="${route}",quantile="0.95"} ${data.p95}`);
      lines.push(`crashlab_duration_ms{route="${route}",quantile="0.99"} ${data.p99}`);
    }

    return lines.join('\n');
  }
}

export const metrics = new MetricsCollector();
