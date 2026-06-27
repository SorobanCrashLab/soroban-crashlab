/**
 * Tests for /api/health/metrics endpoint
 * Tests the real adapter implementation for metrics health checks
 */

import { createPrometheusMetricsExportDependencies } from "../../../../lib/integrations/prometheus-adapter";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function testCreateAdapterWithRealConfig(): Promise<void> {
  const adapter = createPrometheusMetricsExportDependencies({
    endpoint: "http://localhost:9090",
    healthPath: "/-/healthy",
    timeoutMs: 5000,
    enabled: true,
  });

  const config = await adapter.resolveConfig();
  assert(config !== null, "Adapter should resolve config when enabled");
  assert(config?.endpoint === "http://localhost:9090", "Endpoint should match");
  assert(config?.enabled === true, "Config should be enabled");
  console.log("✓ testCreateAdapterWithRealConfig passed");
}

async function testAdapterHealthQueryWithMockFetch(): Promise<void> {
  const mockFetch = async (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> => {
    return new Response(JSON.stringify({ status: "healthy" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const adapter = createPrometheusMetricsExportDependencies({
    endpoint: "http://localhost:9090",
    healthPath: "/-/healthy",
    timeoutMs: 5000,
    enabled: true,
    fetchImpl: mockFetch,
  });

  const health = await adapter.queryExporterHealth("http://localhost:9090");
  assert(health.healthy === true, "Health check should return healthy");
  assert(health.statusCode === 200, "Status code should be 200");
  console.log("✓ testAdapterHealthQueryWithMockFetch passed");
}

async function testAdapterHealthQueryWithUnhealthyEndpoint(): Promise<void> {
  const mockFetch = async (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> => {
    return new Response(JSON.stringify({ status: "unhealthy" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  };

  const adapter = createPrometheusMetricsExportDependencies({
    endpoint: "http://localhost:9090",
    healthPath: "/-/healthy",
    timeoutMs: 5000,
    enabled: true,
    fetchImpl: mockFetch,
  });

  const health = await adapter.queryExporterHealth("http://localhost:9090");
  assert(health.healthy === false, "Health check should return unhealthy");
  assert(health.statusCode === 503, "Status code should be 503");
  console.log("✓ testAdapterHealthQueryWithUnhealthyEndpoint passed");
}

async function testAdapterWithDisabledConfig(): Promise<void> {
  const adapter = createPrometheusMetricsExportDependencies({
    endpoint: "http://localhost:9090",
    healthPath: "/-/healthy",
    timeoutMs: 5000,
    enabled: false,
  });

  const config = await adapter.resolveConfig();
  assert(config === null, "Adapter should return null when disabled");
  console.log("✓ testAdapterWithDisabledConfig passed");
}

async function testAdapterWithEmptyEndpoint(): Promise<void> {
  const adapter = createPrometheusMetricsExportDependencies({
    endpoint: "",
    healthPath: "/-/healthy",
    timeoutMs: 5000,
    enabled: true,
  });

  const config = await adapter.resolveConfig();
  assert(config === null, "Adapter should return null when endpoint is empty");
  console.log("✓ testAdapterWithEmptyEndpoint passed");
}

async function testAdapterWithCustomHeaders(): Promise<void> {
  const capturedHeaders: Record<string, string> = {};

  const mockFetch = async (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> => {
    if (init?.headers) {
      const headers = init.headers as Record<string, string>;
      Object.assign(capturedHeaders, headers);
    }
    return new Response(JSON.stringify({ status: "healthy" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const adapter = createPrometheusMetricsExportDependencies({
    endpoint: "http://localhost:9090",
    healthPath: "/-/healthy",
    timeoutMs: 5000,
    enabled: true,
    headers: { Authorization: "Bearer test-token" },
    fetchImpl: mockFetch,
  });

  await adapter.queryExporterHealth("http://localhost:9090");
  assert(
    capturedHeaders["Authorization"] === "Bearer test-token",
    "Custom headers should be passed",
  );
  console.log("✓ testAdapterWithCustomHeaders passed");
}

async function runAllTests(): Promise<void> {
  console.log("Running Health Metrics API Tests...\n");
  try {
    await testCreateAdapterWithRealConfig();
    await testAdapterHealthQueryWithMockFetch();
    await testAdapterHealthQueryWithUnhealthyEndpoint();
    await testAdapterWithDisabledConfig();
    await testAdapterWithEmptyEndpoint();
    await testAdapterWithCustomHeaders();
    console.log("\n✅ All Health Metrics API tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

if (typeof require !== "undefined" && require.main === module) {
  void runAllTests();
}
