import {
  validateExportConfig,
  buildPrometheusScrapeConfig,
  generateInitialData,
  analyzeTrend,
  runMetricsExportIntegrationFlow,
  ExportConfig,
  MetricsExportDependencies,
} from './integrate-metrics-export-to-prometheus-utils';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function makeConfig(overrides: Partial<ExportConfig> = {}): ExportConfig {
  return {
    endpoint: 'https://prometheus.internal.crashlab.io/metrics',
    interval: 15,
    enabled: true,
    labels: { env: 'production' },
    ...overrides
  };
}

function testValidateExportConfig_valid(): void {
  const r = validateExportConfig(makeConfig());
  assert(r.isValid, 'valid config should pass');
  assert(r.errors.length === 0, 'valid config should have no errors');
  console.log('✓ testValidateExportConfig_valid passed');
}

function testValidateExportConfig_missingEndpoint(): void {
  const r = validateExportConfig(makeConfig({ endpoint: '' }));
  assert(!r.isValid, 'empty endpoint should be invalid');
  assert(r.errors.includes('Endpoint is required'), 'should flag missing endpoint');
  console.log('✓ testValidateExportConfig_missingEndpoint passed');
}

function testValidateExportConfig_invalidEndpointProtocol(): void {
  const r = validateExportConfig(makeConfig({ endpoint: 'ftp://prometheus/metrics' }));
  assert(!r.isValid, 'non http/https endpoint should be invalid');
  assert(r.errors.some(e => e.includes('http:// or https://')), 'should flag invalid protocol');
  console.log('✓ testValidateExportConfig_invalidEndpointProtocol passed');
}

function testValidateExportConfig_invalidInterval(): void {
  const r = validateExportConfig(makeConfig({ interval: 0 }));
  assert(!r.isValid, 'interval <= 0 should be invalid');
  assert(r.errors.some(e => e.includes('greater than 0')), 'should flag invalid interval');
  console.log('✓ testValidateExportConfig_invalidInterval passed');
}

function testBuildPrometheusScrapeConfig(): void {
  const config = makeConfig({ endpoint: 'https://prom.example.com/metrics', interval: 30 });
  const yaml = buildPrometheusScrapeConfig(config);
  assert(yaml.includes('scrape_interval: 30s'), 'should include interval');
  assert(yaml.includes("- targets: ['prom.example.com']"), 'should parse target hostname');
  console.log('✓ testBuildPrometheusScrapeConfig passed');
}

function testGenerateInitialData(): void {
  const data = generateInitialData(5);
  assert(data.length === 5, 'should generate correct number of points');
  assert(data[0].time === '0:00', 'should format time');
  assert(typeof data[0].value === 'number', 'should have numeric value');
  console.log('✓ testGenerateInitialData passed');
}

function testAnalyzeTrend(): void {
  assert(analyzeTrend([{time: '1', value: 10}, {time: '2', value: 20}]) === 'up', 'should detect upward trend');
  assert(analyzeTrend([{time: '1', value: 20}, {time: '2', value: 10}]) === 'down', 'should detect downward trend');
  assert(analyzeTrend([{time: '1', value: 10}, {time: '2', value: 12}]) === 'stable', 'should detect stable trend');
  assert(analyzeTrend([{time: '1', value: 10}]) === 'stable', 'single point should be stable');
  console.log('✓ testAnalyzeTrend passed');
}

function makeDeps(overrides: Partial<MetricsExportDependencies> = {}): MetricsExportDependencies {
  return {
    async resolveConfig() {
      return makeConfig();
    },
    async pushMetrics() {
      return { accepted: true, pushedSeries: 14 };
    },
    async queryExporterHealth() {
      return { healthy: true, statusCode: 200 };
    },
    ...overrides,
  };
}

async function testRunMetricsExportIntegrationFlow_successPath(): Promise<void> {
  const result = await runMetricsExportIntegrationFlow(makeDeps());
  assert(result.success, 'integration flow should succeed');
  assert(result.steps.length === 4, 'all deterministic boundary steps should be reported');
  assert(result.steps.every((step) => step.status === 'passed'), 'all steps should pass');
  assert(result.pushedSeries === 14, 'pushed series count should be surfaced');
  console.log('✓ testRunMetricsExportIntegrationFlow_successPath passed');
}

async function testRunMetricsExportIntegrationFlow_configUnavailable(): Promise<void> {
  const result = await runMetricsExportIntegrationFlow(
    makeDeps({
      async resolveConfig() {
        return null;
      },
    }),
  );
  assert(!result.success, 'flow should fail when config cannot be resolved');
  assert(result.steps.some((step) => step.id === 'config-resolve' && step.status === 'failed'), 'config resolve should fail');
  console.log('✓ testRunMetricsExportIntegrationFlow_configUnavailable passed');
}

async function testRunMetricsExportIntegrationFlow_edgePushRejected(): Promise<void> {
  const result = await runMetricsExportIntegrationFlow(
    makeDeps({
      async pushMetrics() {
        return { accepted: false, pushedSeries: 0 };
      },
    }),
  );
  assert(!result.success, 'flow should fail when push is rejected');
  assert(result.steps.some((step) => step.id === 'metrics-push' && step.status === 'failed'), 'metrics push step should fail');
  console.log('✓ testRunMetricsExportIntegrationFlow_edgePushRejected passed');
}

async function testRunMetricsExportIntegrationFlow_healthFailure(): Promise<void> {
  const result = await runMetricsExportIntegrationFlow(
    makeDeps({
      async queryExporterHealth() {
        return { healthy: false, statusCode: 503 };
      },
    }),
  );
  assert(!result.success, 'flow should fail on downstream health failure');
  assert(result.steps.some((step) => step.id === 'health-query' && step.status === 'failed'), 'health verification step should fail');
  console.log('✓ testRunMetricsExportIntegrationFlow_healthFailure passed');
}

async function runAllTests(): Promise<void> {
  console.log('Running Metrics Export to Prometheus Utils Tests...\\n');
  try {
    testValidateExportConfig_valid();
    testValidateExportConfig_missingEndpoint();
    testValidateExportConfig_invalidEndpointProtocol();
    testValidateExportConfig_invalidInterval();
    testBuildPrometheusScrapeConfig();
    testGenerateInitialData();
    testAnalyzeTrend();
    await testRunMetricsExportIntegrationFlow_successPath();
    await testRunMetricsExportIntegrationFlow_configUnavailable();
    await testRunMetricsExportIntegrationFlow_edgePushRejected();
    await testRunMetricsExportIntegrationFlow_healthFailure();
    console.log('\\n✅ All Metrics Export to Prometheus utils tests passed!');
  } catch (error) {
    console.error('\\n❌ Test failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  void runAllTests();
}
